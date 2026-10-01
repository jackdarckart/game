export function createVibeModule(engine) {
  return {
    init() {},
    resonate() {
      const level = Number(engine.state.upgrades.resonance || 1);
      const gain = 5 * level;
      engine.addVibe(gain);
    }
  };
}
