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
    gunner: 1.02,
    enemy: 0.95,
    brute: 1.45,
    boss: 3.5,
    gate: 2.7,
    barricade: 1.05,
    gun: 0.5,
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
    shooter: { hp: 14, speed: 1.15, radius: 0.32, cost: 2, color: '#a26bb5', bounty: 3, fireInterval: 1.85 },
  };

  const boss = {
    hp: 600,
    radius: 1.6,
    speed: 0.5,
    standoff: 8, // 부대가 보스 앞 이 거리에서 멈춰 정면 승부를 벌인다
    contactCost: 8, // 보스가 스쿼드에 닿으면 잃는 병력
    spawnInterval: 3.05,
    fireInterval: 1.4,
    boltSpeed: 7.5,
  };

  const enemyBolt = { radius: 0.2, cost: 1, speed: 7.5 };

  const barricade = { hp: 60, halfWidth: 1.15, thickness: 0.5, crushCost: 6 };

  /** 드럼통: 몸통에 적힌 횟수만큼 맞히면 터지고 위에 얹힌 총이 떨어진다.
   *  화력 강화와 무관하게 "한 발 = 한 번" 이라 아이가 세면서 쏠 수 있다. */
  const barrel = { hits: 3, maxHits: 6, radius: 0.62, height: 1.4, crushCost: 4, gunZ: 1.95 };

  /** 미니건 병사 — 길에서 구해 합류시키는 아군. 병력 수와 별개로 자기 화력을 쏜다.
   *  게이트 연산(×0·÷2 등)에 영향받지 않는다. 한 번 합류하면 그 챕터 끝까지 함께 싸운다. */
  const gunner = {
    max: 3, // 동시에 데릴 수 있는 수
    fireInterval: 0.1, // 아주 빠른 연사
    damage: 8, // 한 발 피해 (화력 강화가 곱해진다)
    flankGap: 0.5, // 진형 바깥으로 이만큼 떨어져 선다
    pickupRadius: 0.62,
    height: 1.02, // 일반 병사보다 살짝 크게 그린다
    standZ: 0.1,
  };

  /** 총 픽업 — 먹으면 일정 시간 연사가 빨라진다 (겹쳐 먹으면 더 빨라짐). */
  const weapon = {
    pickupRadius: 0.55,
    fireBonusPerStack: 0.35, // 연사 배율에 더해지는 값
    maxStacks: 3,
    duration: 7, // 초
  };

  /** 버티기 모드 — 부대는 제자리에서 버티고, 왼쪽에서 게이트 · 오른쪽에서 드럼통이 계속 밀려온다.
   *  드럼통에 깔리면 병력이 남아 있어도 즉시 끝난다. */
  const survival = {
    gateGap: [15, 24], // 게이트 간 거리 (월드 단위)
    barrelGap: [7, 12],
    waveGap: [17, 25],
    waveGapTighten: 0.035, // 단계마다 웨이브 간격이 이만큼 좁아진다
    coinGap: [26, 44],
    gunnerGap: [130, 190], // 미니건 병사가 기다리는 간격 (화력이 세니 드물게)
    gateWidth: 2.1, // 문 하나 너비 — 여기로 들어가면 연산이 적용된다
    barrelLaneMin: 0.8, // 드럼통은 이보다 오른쪽에만 — 가운데도 위험하게 두되 왼쪽 탈출로는 남긴다
    maxCount: 60, // 버티기 전용 병력 상한. 이보다 커지면 진형이 도로를 막아 못 피한다
    laneMargin: 0.5, // 좌우 절반 안에서 이만큼 여백을 둔다
    tierEvery: 150, // 이 거리마다 난이도 한 단계
    maxTier: 30, // 단계가 평평해지면 강한 플레이어가 무한히 버틴다 — 계속 오르게 둔다
    firstGate: 20, // 첫 게이트까지 몸풀기
    firstBarrel: 34, // 드럼통은 조금 더 뒤부터 (규칙을 먼저 익히게)
    firstWave: 46,
    rewardPerTier: 10, // 한 단계 버틸 때마다 받는 부품
    starSeconds: [60, 150], // ★2 / ★3 기준 버틴 시간
  };

  const scaling = {
    /** 구역이 오를수록 적 체력·수량이 는다. */
    enemyHp: (stage) => 1 + 0.36 * (stage - 1),
    enemyCount: (stage) => 1 + 0.2 * (stage - 1),
    bossHp: (stage) => 1 + 0.85 * (stage - 1),
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
    { name: '11구역 · 하늘 요새', road: '#2a2f44', side: '#464063', sky: ['#160f2a', '#5b4a8e'], far: '#2e2450', kinds: ['grunt', 'runner', 'brute', 'shooter'] },
  ];

  /** 최종 결전 — 33챕터를 모두 깨면 열린다. */
  const finalStage = {
    name: '최종 결전 · 고철 군단 심부',
    road: '#3a2b34', side: '#5c2f3c', sky: ['#2a0d18', '#96324a'], far: '#551f2e',
    kinds: ['grunt', 'runner', 'brute', 'shooter'],
    bossHpMult: 5.5, // 패턴을 여러 번 보여줄 만큼 오래 버텨야 한다 (보스전 목표 40~70초)
    bossRadiusMult: 1.35, // 덩치도 크다
    lengthMult: 1.15,
  };

  /** 최종 보스 패턴 — 체력이 줄면 쓸 수 있는 패턴이 늘어난다.
   *  패턴은 정해진 순서로 돌아간다(아이가 배울 수 있게). */
  const finalBoss = {
    labels: {
      summon: '부하 소환!',
      fan: '부채꼴 사격! 구멍으로!',
      charge: '돌진! 옆으로 피해!',
      sweep: '좌우 난사! 달려!',
    },
    // 남은 체력 비율이 upTo 이하일 때 이 단계 (위에서 아래로 갈수록 험해진다)
    phases: [
      { upTo: 1.0, use: ['summon', 'fan'] },
      { upTo: 0.68, use: ['fan', 'charge', 'summon'] },
      { upTo: 0.36, use: ['charge', 'sweep', 'fan', 'summon'] },
    ],
    durations: { summon: 2.6, fan: 2.6, charge: 3.4, sweep: 2.4 },
    rest: [1.5, 1.1, 0.75], // 단계별 숨 돌리는 시간
    introRest: 1.8, // 등장 직후 첫 패턴까지
    summon: { rows: 2, perRow: 3, span: 6.4, interval: 0.7 },
    fan: { bolts: 7, shots: 3, interval: 0.75 }, // 한 칸은 비운다 (살 구멍)
    charge: { windup: 0.85, windupBack: 1.6, speed: 15, contactCost: 12 },
    sweep: { bolts: 16, interval: 0.13 },
  };

  /** 챕터 — 한 구역에 3챕터. 3챕터마다 그 구역의 대장 로봇이 기다린다. */
  const chapters = {
    perZone: 3,
    // 챕터 1·2 는 코스를 끝까지 버티면 돌파, 3챕터는 대장 로봇을 잡아야 돌파
    lengthMult: [0.55, 0.62, 0.85],
  };

  const pools = { bullets: 220, bolts: 80, enemies: 90, particles: 220 };

  /** 최대로 불린 병력 대비 생존 비율로 별 2~3개 (승리 자체가 별 1개). */
  const starThresholds = { two: 0.3, three: 0.6 };

  /** 병력이 커지면 적도 함께 몰려온다 — 안 그러면 후반이 그냥 산책이 된다. */
  const pressure = {
    extraWavePer: 16, // 병력 16명마다 웨이브 적이 한 겹 더
    maxExtraWaves: 7,
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
    barrel,
    weapon,
    gunner,
    survival,
    scaling,
    stages,
    pools,
    starThresholds,
    pressure,
    finalStage,
    finalBoss,
    chapters,
    zoneCount: stages.length,
    stageCount: stages.length, // 예전 이름 (구역 수)
    chapterCount: stages.length * chapters.perZone, // 11구역 × 3 = 33
    stageTheme(zone) {
      return stages[LW.util.clamp(Math.round(zone), 1, stages.length) - 1];
    },
    stageName(zone) {
      if (zone <= stages.length) return stages[zone - 1].name;
      return zone + '구역 · 무한 전선';
    },

    /* ---- 챕터 번호(1..33) 변환 — 여기가 정본이다 ---- */

    /** 챕터 -> 구역 (1..11) */
    zoneOf(chapter) {
      return Math.floor((Math.max(1, chapter) - 1) / chapters.perZone) + 1;
    },
    /** 챕터 -> 구역 안에서 몇 번째 (1..3) */
    partOf(chapter) {
      return ((Math.max(1, chapter) - 1) % chapters.perZone) + 1;
    },
    /** 구역·챕터 -> 전체 챕터 번호 */
    chapterOf(zone, part) {
      return (zone - 1) * chapters.perZone + part;
    },
    /** 밸런스 스케일용 연속 난이도 값 — 1, 1.33, 1.67, 2, ... 구역 안에서도 조금씩 오른다 */
    difficultyOf(chapter) {
      return LW.config.zoneOf(chapter) + (LW.config.partOf(chapter) - 1) / chapters.perZone;
    },
    /** 3챕터에만 대장 로봇이 있다 */
    hasBossAt(chapter) {
      return LW.config.partOf(chapter) === chapters.perZone;
    },
    chapterName(chapter) {
      const zone = LW.config.zoneOf(chapter);
      const part = LW.config.partOf(chapter);
      const zoneName = LW.config.stageName(zone);
      const place = zoneName.split(' · ')[1] || '전선';
      return zone + '구역 ' + part + '챕터 · ' + place;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
