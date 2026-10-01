const TRACKS = ['VOID PULSE', 'NEON HORIZON', 'DEEP ORBIT', 'SINGULARITY FM'];

export function createJukeboxModule(engine) {
  return {
    init() {
      engine.state.jukebox.unlocked = engine.state.treeNodes.length > 0 || Boolean(engine.state.jukebox.unlocked);
    },
    toggle() {
      if (!engine.state.jukebox.unlocked) {
        if (engine.state.alloys < 5) return;
        engine.state.alloys -= 5;
        engine.state.jukebox.unlocked = true;
      }
      const index = TRACKS.indexOf(engine.state.jukebox.track);
      engine.state.jukebox.track = TRACKS[(index + 1) % TRACKS.length];
      engine.addVibe(3);
    }
  };
}
