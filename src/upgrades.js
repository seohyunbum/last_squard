/* 부품(코인)으로 사는 영구 강화. 레벨 -> 배율은 순수 함수로 둬서 테스트한다. */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  const defs = [
    {
      id: 'start',
      icon: '👥',
      name: '시작 병력',
      desc: '출동할 때 데려가는 병력 수',
      maxLevel: 20,
      cost: (lv) => 40 + lv * 34,
      value: (lv) => LW.config.squad.baseCount + lv * 2,
      display: (lv) => `${LW.config.squad.baseCount + lv * 2}명`,
    },
    {
      id: 'damage',
      icon: '💥',
      name: '화력',
      desc: '병력 1명당 공격력',
      maxLevel: 25,
      cost: (lv) => 35 + lv * 30,
      value: (lv) => 1 + lv * 0.16,
      display: (lv) => `×${(1 + lv * 0.16).toFixed(2)}`,
    },
    {
      id: 'fire',
      icon: '🔥',
      name: '연사 속도',
      desc: '사격 간격이 짧아진다',
      maxLevel: 15,
      cost: (lv) => 50 + lv * 42,
      value: (lv) => 1 + lv * 0.09,
      display: (lv) => `×${(1 + lv * 0.09).toFixed(2)}`,
    },
    {
      id: 'speed',
      icon: '🏃',
      name: '기동력',
      desc: '좌우 이동이 빨라진다',
      maxLevel: 10,
      cost: (lv) => 45 + lv * 30,
      value: (lv) => 1 + lv * 0.07,
      display: (lv) => `×${(1 + lv * 0.07).toFixed(2)}`,
    },
    {
      id: 'loot',
      icon: '🔩',
      name: '부품 회수',
      desc: '전투에서 얻는 부품이 늘어난다',
      maxLevel: 12,
      cost: (lv) => 55 + lv * 38,
      value: (lv) => 1 + lv * 0.12,
      display: (lv) => `×${(1 + lv * 0.12).toFixed(2)}`,
    },
  ];

  const byId = {};
  for (const d of defs) byId[d.id] = d;

  /** 세이브의 levels 맵 -> 실제 전투에 쓰는 수치 묶음. */
  function resolve(levels) {
    const lv = levels || {};
    return {
      startCount: byId.start.value(lv.start | 0),
      damageMult: byId.damage.value(lv.damage | 0),
      fireMult: byId.fire.value(lv.fire | 0),
      speedMult: byId.speed.value(lv.speed | 0),
      lootMult: byId.loot.value(lv.loot | 0),
    };
  }

  function costOf(id, level) {
    const def = byId[id];
    if (!def) return Infinity;
    if (level >= def.maxLevel) return Infinity;
    return Math.round(def.cost(level));
  }

  LW.upgrades = { defs, byId, resolve, costOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
