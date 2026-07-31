/* 밸런스 정본 — 숫자를 만지려면 이 파일만 고친다. */
(function (global) {
  'use strict';
  const LW = (global.LW = global.LW || {});

  /** 도로 좌표계: x 는 -halfWidth..halfWidth, y 는 전진 거리(월드 단위). */
  const world = {
    roadHalfWidth: 4.4,
    playerLine: 0, // 스쿼드 선두는 항상 카메라 기준 고정 라인
    cameraBack: 3.2, // 플레이어 뒤로 보이는 거리
    cameraFront: 19, // 플레이어 앞으로 보이는 거리
  };

  /** 부대 뒤 어깨 시점(광고에서 보던 그 앵글) — 원근 투영 파라미터. */
  const camera = {
    back: 4.2, // 부대 선두에서 카메라까지 (월드 단위)
    height: 7.6, // 카메라 높이 — 크면 위에서 내려다보는 각이 된다
    focalRatio: 0.4, // 초점 거리 = focalRatio * min(화면폭, 화면높이*0.62)
    horizonRatio: 0.3, // 지평선이 화면 위에서 몇 %인가
    near: 1.0, // 이보다 가까운 건 그리지 않는다
    far: 260, // 도로가 여기까지 뻗어 보인다
    drawDistance: 150, // 노면 무늬를 그리는 거리
  };

  /** 오브젝트 세로 높이(월드 단위) — 원근에서 "서 있는" 느낌을 만든다. */
  const heights = {
    unit: 0.82,
    enemy: 0.95,
    brute: 1.45,
    boss: 3.5,
    gate: 2.7,
    barricade: 1.05,
    coin: 0.45,
  };

  const squad = {
    baseCount: 10,
    maxCount: 999,
    basePerRow: 3,
    maxPerRow: 16, // 병력이 늘면 진형이 도로를 채운다 -> 회피가 어려워진다
    spacingX: 0.42,
    spacingY: 0.4,
    maxDrawn: 54, // 이 이상은 그리지 않고 숫자 배지로 표시
    unitRadius: 0.2,
    moveSpeed: 7.6, // 좌우 이동 (월드 단위/초)
    advanceSpeed: 6.4, // 전진 속도
    fireInterval: 0.26,
    damagePerUnit: 1.5,
    maxBulletsPerVolley: 11,
    bulletSpeed: 22,
    bulletRadius: 0.16,
  };

  const enemyKinds = {
    grunt: { hp: 9, speed: 1.7, radius: 0.3, cost: 1, color: '#8d97a8', bounty: 1 },
    runner: { hp: 6, speed: 3.6, radius: 0.26, cost: 1, color: '#c98a4b', bounty: 1 },
    brute: { hp: 36, speed: 1.05, radius: 0.52, cost: 3, color: '#6f7d95', bounty: 4 },
    shooter: { hp: 14, speed: 1.15, radius: 0.32, cost: 2, color: '#a26bb5', bounty: 3, fireInterval: 2.1 },
  };

  const boss = {
    hp: 570,
    radius: 1.6,
    speed: 0.5,
    standoff: 8, // 부대가 보스 앞 이 거리에서 멈춰 정면 승부를 벌인다
    contactCost: 8, // 보스가 스쿼드에 닿으면 잃는 병력
    spawnInterval: 3.4,
    fireInterval: 1.55,
    boltSpeed: 7.5,
  };

  const enemyBolt = { radius: 0.2, cost: 1, speed: 7.5 };

  const barricade = { hp: 60, halfWidth: 1.15, thickness: 0.5, crushCost: 6 };

  const scaling = {
    /** 구역이 오를수록 적 체력·수량이 는다. */
    enemyHp: (stage) => 1 + 0.29 * (stage - 1),
    enemyCount: (stage) => 1 + 0.14 * (stage - 1),
    bossHp: (stage) => 1 + 0.72 * (stage - 1),
    length: (stage) => 250 + 26 * (stage - 1),
    reward: (stage) => 26 + 12 * (stage - 1),
  };

  /** 구역 테마 — 배경색과 등장 적 구성. 넘어가면 마지막 테마를 반복(엔드리스). */
  const stages = [
    { name: '1구역 · 폐차장', road: '#3a4050', side: '#4d4130', sky: ['#1b2740', '#4a5b7d'], far: '#2a3450', kinds: ['grunt'] },
    { name: '2구역 · 고물 야드', road: '#374051', side: '#42522f', sky: ['#1a2c3c', '#5a7a6a'], far: '#27423a', kinds: ['grunt', 'runner'] },
    { name: '3구역 · 컨테이너 항', road: '#324256', side: '#2c505c', sky: ['#12283c', '#3f7d92'], far: '#1e4453', kinds: ['grunt', 'runner', 'brute'] },
    { name: '4구역 · 발전소 터', road: '#3a3648', side: '#553748', sky: ['#241a34', '#6e4666'], far: '#3b2540', kinds: ['grunt', 'runner', 'shooter'] },
    { name: '5구역 · 지하 통로', road: '#2b303c', side: '#383b4c', sky: ['#0d1018', '#2a3040'], far: '#1a1e28', kinds: ['grunt', 'brute', 'shooter'] },
    { name: '6구역 · 사막 국도', road: '#443b31', side: '#7a663f', sky: ['#3d2a18', '#c08a4a'], far: '#6b5230', kinds: ['runner', 'brute', 'shooter'] },
    { name: '7구역 · 눈 덮인 다리', road: '#3a424e', side: '#7d8b99', sky: ['#20303f', '#8fa8ba'], far: '#5b6c7c', kinds: ['grunt', 'runner', 'brute', 'shooter'] },
    { name: '8구역 · 용광로', road: '#453036', side: '#75382a', sky: ['#3a1410', '#b8482a'], far: '#63241c', kinds: ['runner', 'brute', 'shooter'] },
    { name: '9구역 · 폐허 도심', road: '#333844', side: '#4c4c58', sky: ['#181c26', '#4a4f5e'], far: '#2c3040', kinds: ['grunt', 'runner', 'brute', 'shooter'] },
    { name: '10구역 · 사령부', road: '#2c3446', side: '#3c4c68', sky: ['#101a2c', '#3e5a86'], far: '#22304a', kinds: ['grunt', 'runner', 'brute', 'shooter'] },
  ];

  const pools = { bullets: 220, bolts: 80, enemies: 90, particles: 220 };

  /** 최대로 불린 병력 대비 생존 비율로 별 2~3개 (승리 자체가 별 1개). */
  const starThresholds = { two: 0.3, three: 0.6 };

  /** 병력이 커지면 적도 함께 몰려온다 — 안 그러면 후반이 그냥 산책이 된다. */
  const pressure = {
    extraWavePer: 20, // 병력 20명마다 웨이브 적이 한 겹 더
    maxExtraWaves: 6,
    enemyHpPerUnit: 1 / 150, // 병력 150명이면 적 체력 +100%
    maxEnemyHpBonus: 4,
    bossHpPerUnit: 1 / 45, // 큰 부대로 가면 보스도 그만큼 단단해진다
    maxBossHpBonus: 20,
    contactPerUnit: 1 / 200, // 큰 부대는 한 번 부딪힐 때 더 많이 잃는다
    maxContactBonus: 5,
  };

  LW.config = {
    world,
    camera,
    heights,
    squad,
    enemyKinds,
    boss,
    enemyBolt,
    barricade,
    scaling,
    stages,
    pools,
    starThresholds,
    pressure,
    stageCount: stages.length,
    stageTheme(stage) {
      return stages[Math.min(stage, stages.length) - 1];
    },
    stageName(stage) {
      if (stage <= stages.length) return stages[stage - 1].name;
      return stage + '구역 · 무한 전선';
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
