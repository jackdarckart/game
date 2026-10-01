const COST = 10;

export function createTreeModule(engine) {
  return {
    init() {},
    unlockNext() {
      if (engine.state.fragments < COST) return;
      engine.state.fragments -= COST;
      const nextId = engine.state.treeNodes.length + 1;
      engine.state.treeNodes.push(`NODE-${String(nextId).padStart(2, '0')}`);
      engine.state.upgrades.resonance += 1;
      engine.state.upgrades.efficiency += 1;
      engine.addVibe(15);
    }
  };
}
