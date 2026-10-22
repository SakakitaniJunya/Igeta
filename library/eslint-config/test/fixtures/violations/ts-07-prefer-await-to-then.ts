export function load(task: Promise<string>) {
  return task.then((value) => value);
}
