const campusGraph = {
  nodes: {
    // ── Entry points & path junctions ────────────────────────────────────────
    main_gate:  [30.3971,  78.0737],
    junction_1: [30.3977,  78.0745],   // near civil / boys_hostel fork
    junction_2: [30.3982,  78.0751],   // central crossroads
    junction_3: [30.3992,  78.0760],   // upper campus near vedanta

    // ── Buildings — IDs match Firestore document IDs exactly ────────────────
    vedanta:     [30.399613, 78.076816],
    chanakya:    [30.398061, 78.075131],
    civil:       [30.398250, 78.074850],
    vivekananda: [30.397883, 78.075436],
    boys_hostel: [30.397466, 78.074348],
    girls_hostel:[30.400400, 78.076777],
  },

  edges: {
    // ── Main gate → campus ────────────────────────────────────────────────
    main_gate: [
      ['junction_1', 95],
    ],

    // ── Junction 1 — lower campus fork ───────────────────────────────────
    junction_1: [
      ['main_gate',   95],
      ['boys_hostel', 70],
      ['civil',       85],
      ['junction_2',  75],
    ],

    // ── Junction 2 — central crossroads ──────────────────────────────────
    junction_2: [
      ['junction_1',  75],
      ['chanakya',    40],
      ['vivekananda', 55],
      ['junction_3', 120],
    ],

    // ── Junction 3 — upper campus ─────────────────────────────────────────
    junction_3: [
      ['junction_2',   120],
      ['vedanta',       95],
      ['girls_hostel',  80],
    ],

    // ── Buildings ─────────────────────────────────────────────────────────
    vedanta: [
      ['junction_3',   95],
      ['girls_hostel', 105],
    ],
    chanakya: [
      ['junction_2',  40],
      ['vivekananda', 45],
      ['civil',       60],
    ],
    civil: [
      ['junction_1',  85],
      ['chanakya',    60],
      ['boys_hostel', 95],
    ],
    vivekananda: [
      ['junction_2', 55],
      ['chanakya',   45],
    ],
    boys_hostel: [
      ['junction_1', 70],
      ['civil',      95],
    ],
    girls_hostel: [
      ['junction_3',  80],
      ['vedanta',    105],
    ],
  },
};

export default campusGraph;