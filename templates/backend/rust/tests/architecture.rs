// 層の向きの規則 16 本。src/ の全 .rs を読み、各ファイルの `use` と `crate::` の path、外部 crate の path を取り出して判定する。
// `#[cfg(test)]` 以降の行と `*_test.rs` は本番の規則から外す (単体テストは何を使ってもよい)。
// 規則 1 本 = テスト 1 本。落ちた規則の名前と、違反した「ファイル -> 行き先」が出る。

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

const STD: [&str; 3] = ["std", "core", "alloc"];
/// path を本文中で探す外部 crate (use の無い `axum::Router` のような書き方も拾うため)。
const KNOWN_EXTERNALS: [&str; 11] = [
    "axum",
    "tower_http",
    "tower",
    "serde_json",
    "serde_path_to_error",
    "serde_urlencoded",
    "serde",
    "firestore",
    "tokio",
    "uuid",
    "http_body_util",
];

#[derive(Debug, Clone, PartialEq, Eq)]
enum Layer {
    Main,
    Entries,
    SharedDomain,
    SharedInfrastructure,
    SharedPresentation,
    SharedTestSupport,
    Module { name: String, layer: ModuleLayer },
    /// modules/<name>/mod.rs (公開面)
    ModuleRoot(String),
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ModuleLayer {
    Domain,
    Application,
    Presentation,
    Infrastructure,
}

struct Source {
    /// src/ からの相対 path (例: modules/sample/domain/item.rs)
    path: String,
    layer: Layer,
    /// 行き先のファイル (src/ からの相対 path)
    internal: BTreeSet<String>,
    externals: BTreeSet<String>,
}

fn classify(path: &str) -> Layer {
    let parts: Vec<&str> = path.split('/').collect();
    match parts.as_slice() {
        ["main.rs"] => Layer::Main,
        ["entries", ..] => Layer::Entries,
        ["shared", "domain", ..] => Layer::SharedDomain,
        ["shared", "infrastructure", ..] => Layer::SharedInfrastructure,
        ["shared", "presentation", ..] => Layer::SharedPresentation,
        ["shared", "test_support", ..] => Layer::SharedTestSupport,
        ["modules", name, "mod.rs"] => Layer::ModuleRoot(name.to_string()),
        ["modules", name, layer, ..] => {
            let layer = match *layer {
                "domain" => ModuleLayer::Domain,
                "application" => ModuleLayer::Application,
                "presentation" => ModuleLayer::Presentation,
                "infrastructure" => ModuleLayer::Infrastructure,
                _ => return Layer::Other,
            };
            Layer::Module { name: name.to_string(), layer }
        }
        _ => Layer::Other,
    }
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let mut entries: Vec<_> = fs::read_dir(dir).unwrap().map(|e| e.unwrap().path()).collect();
    entries.sort();
    for path in entries {
        if path.is_dir() {
            walk(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

/// 本番の行だけ (最初の `#[cfg(test)]` より前、コメントを除く)。
fn production_text(text: &str) -> String {
    let mut out = String::new();
    for line in text.lines() {
        if line.trim_start().starts_with("#[cfg(test)]") {
            break;
        }
        let code = if line.trim_start().starts_with("//") { "" } else { line.split(" //").next().unwrap_or("") };
        out.push_str(code);
        out.push('\n');
    }
    out
}

/// `use` 文の本文 (`use` と `;` を除く) を全部取り出す。複数行にまたがってもよい。
fn use_statements(text: &str) -> Vec<String> {
    let mut found = Vec::new();
    let mut current: Option<String> = None;
    for line in text.lines() {
        let trimmed = line.trim();
        if current.is_none() {
            let rest = ["pub(crate) use ", "pub use ", "use "].iter().find_map(|p| trimmed.strip_prefix(p));
            if let Some(rest) = rest {
                current = Some(String::new());
                push_line(&mut current, &mut found, rest);
            }
        } else {
            push_line(&mut current, &mut found, trimmed);
        }
    }
    found
}

fn push_line(current: &mut Option<String>, found: &mut Vec<String>, line: &str) {
    let buffer = current.as_mut().unwrap();
    if let Some(end) = line.find(';') {
        buffer.push_str(&line[..end]);
        found.push(current.take().unwrap());
    } else {
        buffer.push_str(line);
    }
}

fn split_top(s: &str) -> Vec<&str> {
    let (mut depth, mut start, mut parts) = (0, 0, Vec::new());
    for (i, c) in s.char_indices() {
        match c {
            '{' => depth += 1,
            '}' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&s[start..]);
    parts
}

fn matching_brace(s: &str, open: usize) -> usize {
    let mut depth = 0;
    for (i, c) in s.char_indices().skip(open) {
        match c {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return i;
                }
            }
            _ => {}
        }
    }
    panic!("対応する閉じ括弧が無い: {s}");
}

/// `a::{b, c::{d, e}}` を [[a,b],[a,c,d],[a,c,e]] に展開する。`as` と `*` と `self` は落とす。
fn expand(s: &str) -> Vec<Vec<String>> {
    let s = s.trim();
    if s.is_empty() {
        return Vec::new();
    }
    let Some(open) = s.find('{') else {
        let s = s.split(" as ").next().unwrap_or(s).trim();
        let mut segs: Vec<String> = s.split("::").map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect();
        if segs.last().is_some_and(|l| l == "*" || l == "self") && segs.len() > 1 {
            segs.pop();
        }
        return vec![segs];
    };
    let close = matching_brace(s, open);
    let prefix: Vec<String> = s[..open].split("::").map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect();
    let mut out = Vec::new();
    for part in split_top(&s[open + 1..close]) {
        let part = part.trim();
        let tails = if part == "self" { vec![Vec::new()] } else { expand(part) };
        for tail in tails {
            let mut path = prefix.clone();
            path.extend(tail);
            out.push(path);
        }
    }
    out
}

fn is_ident_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// 本文中の `name::a::b` を取り出す (直前が識別子の一部や `::` のものは別物なので除く)。
fn inline_paths(text: &str, name: &str) -> Vec<Vec<String>> {
    let needle = format!("{name}::");
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(found) = text[from..].find(&needle) {
        let at = from + found;
        from = at + needle.len();
        let before = text[..at].chars().next_back();
        if before.is_some_and(|c| is_ident_char(c) || c == ':') {
            continue;
        }
        let tail: String = text[at..].chars().take_while(|c| is_ident_char(*c) || *c == ':').collect();
        out.push(tail.split("::").filter(|x| !x.is_empty()).map(str::to_string).collect());
    }
    out
}

/// ファイルの module path (src/a/b.rs -> [a, b]、src/a/mod.rs -> [a])。
fn module_path(path: &str) -> Vec<String> {
    let mut segs: Vec<String> = path.trim_end_matches(".rs").split('/').map(str::to_string).collect();
    if segs.last().is_some_and(|l| l == "mod") || path == "main.rs" || path == "lib.rs" {
        segs.pop();
    }
    segs
}

enum Target {
    Internal(Vec<String>),
    External(String),
}

fn normalize(path: &[String], file: &str) -> Option<Target> {
    let first = path.first()?;
    let here = module_path(file);
    match first.as_str() {
        "crate" => Some(Target::Internal(path[1..].to_vec())),
        "backend" if file == "main.rs" => Some(Target::Internal(path[1..].to_vec())),
        "self" => Some(Target::Internal([here, path[1..].to_vec()].concat())),
        "super" => {
            let (mut base, mut rest) = (here, path);
            while rest.first().is_some_and(|s| s == "super") {
                base.pop();
                rest = &rest[1..];
            }
            Some(Target::Internal([base, rest.to_vec()].concat()))
        }
        name if STD.contains(&name) => Some(Target::External("std".to_string())),
        name => Some(Target::External(name.to_string())),
    }
}

/// segments を src/ 以下のファイルに解く。実在する一番深い module のファイル。
fn resolve(src: &Path, segs: &[String]) -> String {
    let mut dir = PathBuf::new();
    let mut file = "lib.rs".to_string();
    for seg in segs {
        let as_file = dir.join(format!("{seg}.rs"));
        let as_mod = dir.join(seg).join("mod.rs");
        if src.join(&as_file).is_file() {
            file = as_file.to_string_lossy().to_string();
            dir = dir.join(seg);
        } else if src.join(&as_mod).is_file() {
            file = as_mod.to_string_lossy().to_string();
            dir = dir.join(seg);
        } else {
            break;
        }
    }
    file
}

fn scan() -> Vec<Source> {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    walk(&src, &mut files);
    files
        .iter()
        // `*_test.rs` は `#[cfg(test)] mod …_test;` で隣から取り込む単体テスト。本番の規則からは外す。
        .filter(|file| !file.to_string_lossy().ends_with("_test.rs"))
        .map(|file| {
            let path = file.strip_prefix(&src).unwrap().to_string_lossy().to_string();
            let text = production_text(&fs::read_to_string(file).unwrap());
            let mut paths: Vec<Vec<String>> = use_statements(&text).iter().flat_map(|u| expand(u)).collect();
            paths.extend(inline_paths(&text, "crate"));
            if path == "main.rs" {
                paths.extend(inline_paths(&text, "backend"));
            }
            for name in KNOWN_EXTERNALS {
                paths.extend(inline_paths(&text, name));
            }
            let (mut internal, mut externals) = (BTreeSet::new(), BTreeSet::new());
            for p in &paths {
                match normalize(p, &path) {
                    Some(Target::Internal(segs)) => {
                        let target = resolve(&src, &segs);
                        if target != path {
                            internal.insert(target);
                        }
                    }
                    Some(Target::External(name)) => {
                        externals.insert(name);
                    }
                    None => {}
                }
            }
            Source { layer: classify(&path), path, internal, externals }
        })
        .collect()
}

fn is_module_layer(layer: &Layer, wanted: ModuleLayer) -> bool {
    matches!(layer, Layer::Module { layer, .. } if *layer == wanted)
}

fn module_name(layer: &Layer) -> Option<&str> {
    match layer {
        Layer::Module { name, .. } | Layer::ModuleRoot(name) => Some(name),
        _ => None,
    }
}

/// 規則を全ファイルに当てる。`check(file, target_path, target_layer)` が true なら違反。
fn violations_by_target(check: impl Fn(&Source, &str, &Layer) -> bool) -> Vec<String> {
    let sources = scan();
    let mut out = Vec::new();
    for source in &sources {
        for target in &source.internal {
            if check(source, target, &classify(target)) {
                out.push(format!("{} -> {}", source.path, target));
            }
        }
    }
    out
}

fn violations_by_external(applies: impl Fn(&Layer) -> bool, banned: impl Fn(&str) -> bool) -> Vec<String> {
    scan()
        .iter()
        .filter(|s| applies(&s.layer))
        .flat_map(|s| s.externals.iter().filter(|e| banned(e)).map(|e| format!("{} -> {}", s.path, e)).collect::<Vec<_>>())
        .collect()
}

fn assert_none(rule: &str, violations: Vec<String>) {
    assert!(violations.is_empty(), "{rule} に違反:\n  {}", violations.join("\n  "));
}

#[test]
fn scans_the_source_tree() {
    let sources = scan();
    assert!(sources.len() >= 10, "src/ を読めていない: {} ファイル", sources.len());
    assert!(sources.iter().any(|s| s.path == "lib.rs"));
}

#[test]
fn domain_depends_on_shared_domain_only() {
    assert_none(
        "domain-depends-on-shared-domain-only",
        violations_by_target(|s, _, t| {
            is_module_layer(&s.layer, ModuleLayer::Domain)
                && !(*t == Layer::SharedDomain
                    || (is_module_layer(t, ModuleLayer::Domain) && module_name(t) == module_name(&s.layer)))
        }),
    );
}

#[test]
fn domain_is_framework_free() {
    assert_none(
        "domain-is-framework-free",
        violations_by_external(
            |l| *l == Layer::SharedDomain || is_module_layer(l, ModuleLayer::Domain),
            |e| e != "std",
        ),
    );
}

#[test]
fn application_does_not_look_outward() {
    assert_none(
        "application-does-not-look-outward",
        violations_by_target(|s, _, t| {
            is_module_layer(&s.layer, ModuleLayer::Application)
                && (is_module_layer(t, ModuleLayer::Infrastructure)
                    || is_module_layer(t, ModuleLayer::Presentation)
                    || *t == Layer::SharedPresentation
                    || *t == Layer::SharedInfrastructure)
        }),
    );
}

#[test]
fn application_is_framework_free() {
    assert_none(
        "application-is-framework-free",
        violations_by_external(
            |l| is_module_layer(l, ModuleLayer::Application),
            |e| ["firestore", "axum", "tower", "tower_http", "serde", "serde_json", "serde_path_to_error", "serde_urlencoded"].contains(&e),
        ),
    );
}

#[test]
fn presentation_goes_through_application() {
    assert_none(
        "presentation-goes-through-application",
        violations_by_target(|s, _, t| {
            is_module_layer(&s.layer, ModuleLayer::Presentation)
                && (is_module_layer(t, ModuleLayer::Domain) || is_module_layer(t, ModuleLayer::Infrastructure))
        }),
    );
}

#[test]
fn infrastructure_is_not_presentation() {
    assert_none(
        "infrastructure-is-not-presentation",
        violations_by_target(|s, _, t| {
            is_module_layer(&s.layer, ModuleLayer::Infrastructure)
                && (is_module_layer(t, ModuleLayer::Presentation) || *t == Layer::SharedPresentation)
        }),
    );
}

#[test]
fn firestore_only_in_infrastructure() {
    assert_none(
        "firestore-only-in-infrastructure",
        violations_by_external(
            |l| !(is_module_layer(l, ModuleLayer::Infrastructure) || *l == Layer::SharedInfrastructure || matches!(l, Layer::ModuleRoot(_))),
            |e| e == "firestore",
        ),
    );
}

#[test]
fn production_does_not_import_test_support() {
    assert_none(
        "production-does-not-import-test-support",
        violations_by_target(|s, _, t| *t == Layer::SharedTestSupport && s.layer != Layer::SharedTestSupport),
    );
}

#[test]
fn shared_infrastructure_only_from_infrastructure_and_entries() {
    assert_none(
        "shared-infrastructure-only-from-infrastructure-and-entries",
        violations_by_target(|s, _, t| {
            *t == Layer::SharedInfrastructure
                && !(is_module_layer(&s.layer, ModuleLayer::Infrastructure)
                    || matches!(s.layer, Layer::Entries | Layer::Main | Layer::SharedInfrastructure))
        }),
    );
}

#[test]
fn cross_module_through_mod_only() {
    assert_none(
        "cross-module-through-mod-only",
        violations_by_target(|s, target, t| {
            let (Some(from), Some(to)) = (module_name(&s.layer), module_name(t)) else { return false };
            from != to && !matches!(t, Layer::ModuleRoot(_)) && target.ends_with(".rs")
        }),
    );
}

#[test]
fn entries_go_through_module_mod() {
    assert_none(
        "entries-go-through-module-mod",
        violations_by_target(|s, _, t| {
            matches!(s.layer, Layer::Entries | Layer::Main) && matches!(t, Layer::Module { .. })
        }),
    );
}

#[test]
fn shared_is_a_leaf() {
    assert_none(
        "shared-is-a-leaf",
        violations_by_target(|s, target, _| {
            matches!(
                s.layer,
                Layer::SharedDomain | Layer::SharedInfrastructure | Layer::SharedPresentation | Layer::SharedTestSupport
            ) && (target.starts_with("modules/") || target.starts_with("entries/") || target == "main.rs")
        }),
    );
}

#[test]
fn axum_only_in_entries() {
    assert_none(
        "axum-only-in-entries",
        violations_by_external(
            |l| !matches!(l, Layer::Entries | Layer::Main),
            |e| ["axum", "tower", "tower_http"].contains(&e),
        ),
    );
}

#[test]
fn serde_only_in_presentation_and_infrastructure() {
    assert_none(
        "serde-only-in-presentation-and-infrastructure",
        violations_by_external(
            |l| {
                !(is_module_layer(l, ModuleLayer::Presentation)
                    || is_module_layer(l, ModuleLayer::Infrastructure)
                    || *l == Layer::SharedPresentation)
            },
            |e| e == "serde" || e == "serde_path_to_error",
        ),
    );
}

#[test]
fn module_does_not_import_entries() {
    assert_none(
        "module-does-not-import-entries",
        violations_by_target(|s, target, _| module_name(&s.layer).is_some() && target.starts_with("entries/")),
    );
}

#[test]
fn no_circular() {
    let sources = scan();
    let graph: BTreeMap<&str, Vec<&str>> =
        sources.iter().map(|s| (s.path.as_str(), s.internal.iter().map(String::as_str).collect())).collect();
    // 深さ優先で、いま辿っている道の上に戻ってきたら循環。
    fn visit<'a>(node: &'a str, graph: &BTreeMap<&'a str, Vec<&'a str>>, stack: &mut Vec<&'a str>, done: &mut BTreeSet<&'a str>) -> Option<Vec<String>> {
        if let Some(at) = stack.iter().position(|n| *n == node) {
            return Some(stack[at..].iter().chain([&node]).map(|s| s.to_string()).collect());
        }
        if done.contains(node) {
            return None;
        }
        stack.push(node);
        for next in graph.get(node).into_iter().flatten() {
            if let Some(cycle) = visit(next, graph, stack, done) {
                return Some(cycle);
            }
        }
        stack.pop();
        done.insert(node);
        None
    }
    let mut done = BTreeSet::new();
    for node in graph.keys() {
        if let Some(cycle) = visit(node, &graph, &mut Vec::new(), &mut done) {
            panic!("no-circular に違反: {}", cycle.join(" -> "));
        }
    }
}
