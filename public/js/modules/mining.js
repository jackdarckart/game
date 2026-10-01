export function createMiningModule(engine) {
  return {
    init() {},
    mine() {
      const level = Number(engine.state.upgrades.mining || 1);
      const efficiency = Number(engine.state.upgrades.efficiency || 1);
      const fragments = Math.max(1, level * efficiency);
      const alloys = Math.max(1, Math.floor(level / 2));
      engine.addFragments(fragments);
      engine.addAlloys(alloys);
      engine.addVibe(level);
    }
  };
}
