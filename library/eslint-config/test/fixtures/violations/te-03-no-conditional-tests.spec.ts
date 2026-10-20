if (process.env.CI) {
  it("conditional", () => {
    expect(1).toBe(1);
  });
}
