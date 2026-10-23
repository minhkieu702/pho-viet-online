export type MissionId = 'coffee' | 'market' | 'post' | 'tour' | 'cleanup' | 'circuit';

export type MissionTarget = { x: number; z: number };

export type MissionStep = {
  objective: string;
  label: string;
  target: MissionTarget;
  mode: 'interact' | 'proximity';
  requiresBike?: boolean;
  requiresOnFoot?: boolean;
};

export type MissionDefinition = {
  id: MissionId;
  title: string;
  description: string;
  rewardCash: number;
  rewardScore: number;
  delivery: boolean;
  steps: readonly MissionStep[];
  timeLimitSeconds?: number;
};

export type MissionPlayer = { x: number; z: number; riding: boolean; down: boolean };

export type MissionView = {
  id: MissionId;
  title: string;
  description: string;
  objective: string;
  label: string;
  step: number;
  total: number;
  target: MissionTarget | null;
  status: 'active' | 'completed' | 'failed';
  remainingSeconds: number | null;
  started: boolean;
  rewardCash: number;
  rewardScore: number;
  completedIds: MissionId[];
  requiresBike: boolean;
  requiresOnFoot: boolean;
};

export type MissionEvent = {
  message: string;
  reward?: { cash: number; score: number; delivery: boolean };
};

export type MissionController = {
  view(): MissionView;
  select(id: MissionId): void;
  reset(): void;
  interact(player: MissionPlayer): MissionEvent | null;
  update(dtSeconds: number, player: MissionPlayer): MissionEvent | null;
};

// Cash uses the same thousands-of-dong unit as the game's wallet.
export const MISSION_DEFS: readonly MissionDefinition[] = [
  {
    id: 'coffee',
    title: 'Cà phê sáng',
    description: 'Nhận cà phê ở quán quen rồi giao đến khách bên bưu điện.',
    rewardCash: 100,
    rewardScore: 50,
    delivery: true,
    steps: [
      { objective: 'Đến quán cà phê và nhấn E để nhận đơn.', label: 'Nhận cà phê', target: { x: -32, z: 7 }, mode: 'interact' },
      { objective: 'Mang cà phê đến khách bên bưu điện, nhấn E để giao.', label: 'Giao cà phê', target: { x: 54, z: -35 }, mode: 'interact' },
    ],
  },
  {
    id: 'market',
    title: 'Chuyến hàng từ chợ',
    description: 'Giúp quán cà phê lấy một giỏ nguyên liệu từ khu chợ.',
    rewardCash: 130,
    rewardScore: 70,
    delivery: true,
    steps: [
      { objective: 'Đến điểm hẹn ở chợ và nhấn E để lấy nguyên liệu.', label: 'Lấy hàng ở chợ', target: { x: -42, z: 49.6 }, mode: 'interact' },
      { objective: 'Đưa nguyên liệu về quán cà phê, nhấn E để giao.', label: 'Giao nguyên liệu', target: { x: -32, z: 7 }, mode: 'interact' },
    ],
  },
  {
    id: 'post',
    title: 'Bưu tá phố nhỏ',
    description: 'Nhận hai bưu kiện rồi giao lần lượt cho khách ở phố Tây và phố Nam.',
    rewardCash: 180,
    rewardScore: 100,
    delivery: true,
    steps: [
      { objective: 'Đến điểm hẹn bên bưu điện và nhấn E để nhận bưu kiện.', label: 'Nhận bưu kiện', target: { x: 54, z: -35 }, mode: 'interact' },
      { objective: 'Giao bưu kiện cho khách ở phố Tây bằng phím E.', label: 'Giao ở phố Tây', target: { x: -65, z: -54 }, mode: 'interact' },
      { objective: 'Mang kiện còn lại đến phố Nam, nhấn E để giao.', label: 'Giao ở phố Nam', target: { x: 0, z: 54 }, mode: 'interact' },
    ],
  },
  {
    id: 'tour',
    title: 'Một vòng Phố Việt',
    description: 'Tự do đi bộ hoặc lái xe khám phá bốn góc phố. Đi vào vòng sáng để ghi nhận.',
    rewardCash: 120,
    rewardScore: 80,
    delivery: false,
    steps: [
      { objective: 'Ghé giao lộ phía Tây và đi vào vòng sáng.', label: 'Góc phố Tây', target: { x: -54, z: 0 }, mode: 'proximity' },
      { objective: 'Ghé góc phố Đông Bắc, đi vào vòng sáng.', label: 'Góc phố Đông Bắc', target: { x: 45, z: -30 }, mode: 'proximity' },
      { objective: 'Theo đường đến điểm ngắm phố ở phía Bắc.', label: 'Điểm ngắm phố', target: { x: 0, z: -82 }, mode: 'proximity' },
      { objective: 'Kết thúc chuyến dạo phố tại điểm hẹn phía Nam.', label: 'Phố Nam nhộn nhịp', target: { x: 28, z: 49.6 }, mode: 'proximity' },
    ],
  },
  {
    id: 'cleanup',
    title: 'Góc phố xanh',
    description: 'Xuống xe, đi bộ đến bốn điểm quanh công viên và nhấn E để dọn rác.',
    rewardCash: 150,
    rewardScore: 90,
    delivery: false,
    steps: [
      { objective: 'Đi bộ đến phía Nam công viên và nhấn E để dọn rác.', label: 'Dọn phía Nam', target: { x: 8, z: 30 }, mode: 'interact', requiresOnFoot: true },
      { objective: 'Đi bộ đến phía Bắc công viên và nhấn E để dọn rác.', label: 'Dọn phía Bắc', target: { x: -8, z: -30 }, mode: 'interact', requiresOnFoot: true },
      { objective: 'Đi bộ đến phía Đông công viên và nhấn E để dọn rác.', label: 'Dọn phía Đông', target: { x: 30, z: 8 }, mode: 'interact', requiresOnFoot: true },
      { objective: 'Đi bộ đến phía Tây công viên và nhấn E để dọn nốt.', label: 'Dọn phía Tây', target: { x: -30, z: -8 }, mode: 'interact', requiresOnFoot: true },
    ],
  },
  {
    id: 'circuit',
    title: 'Tay lái phố Việt',
    description: 'Lên xe máy, nhấn E tại vạch xuất phát rồi qua sáu chốt trong 100 giây. Ngã xe sẽ kết thúc lượt.',
    rewardCash: 250,
    rewardScore: 150,
    delivery: false,
    timeLimitSeconds: 100,
    steps: [
      { objective: 'Lên xe máy, đến phố Nam và nhấn E để xuất phát.', label: 'Vạch xuất phát', target: { x: 0, z: 54 }, mode: 'interact', requiresBike: true },
      { objective: 'Lái xe qua chốt ở giao lộ Tây Nam.', label: 'Chốt Tây Nam', target: { x: -54, z: 54 }, mode: 'proximity', requiresBike: true },
      { objective: 'Theo đường phía Tây đến chốt Tây Bắc.', label: 'Chốt Tây Bắc', target: { x: -54, z: -54 }, mode: 'proximity', requiresBike: true },
      { objective: 'Theo đường tới chốt ngoài cùng phía Bắc.', label: 'Chốt phía Bắc', target: { x: 0, z: -82 }, mode: 'proximity', requiresBike: true },
      { objective: 'Quay lại đường lớn và lái tới chốt Đông Bắc.', label: 'Chốt Đông Bắc', target: { x: 54, z: -54 }, mode: 'proximity', requiresBike: true },
      { objective: 'Theo đường phía Đông đến chốt Đông Nam.', label: 'Chốt Đông Nam', target: { x: 54, z: 54 }, mode: 'proximity', requiresBike: true },
      { objective: 'Lái xe về vạch đích ở phố Nam.', label: 'Vạch đích', target: { x: 0, z: 54 }, mode: 'proximity', requiresBike: true },
    ],
  },
];

const REACH_DISTANCE = 6.5;

export function createMissions(): MissionController {
  let definition = MISSION_DEFS[0];
  let step = 0;
  let status: MissionView['status'] = 'active';
  let started = false;
  let elapsedSeconds = 0;
  const completedIds = new Set<MissionId>();

  function select(id: MissionId) {
    const next = MISSION_DEFS.find((mission) => mission.id === id);
    if (!next) throw new RangeError(`Unknown mission: ${id}`);
    definition = next;
    step = 0;
    status = 'active';
    started = false;
    elapsedSeconds = 0;
  }

  function nearby(player: MissionPlayer, target: MissionTarget) {
    return Math.hypot(player.x - target.x, player.z - target.z) <= REACH_DISTANCE;
  }

  function restriction(player: MissionPlayer, objective: MissionStep): string | null {
    if (player.down) return 'Hãy đứng dậy rồi tiếp tục nhiệm vụ.';
    if (objective.requiresBike && !player.riding) return 'Hãy lên xe máy để tiếp tục thử thách tay lái.';
    if (objective.requiresOnFoot && player.riding) return 'Hãy xuống xe trước khi dọn rác.';
    return null;
  }

  function fail(message: string): MissionEvent {
    status = 'failed';
    return { message };
  }

  function advance(): MissionEvent {
    step += 1;
    started = true;
    if (step === definition.steps.length) {
      status = 'completed';
      completedIds.add(definition.id);
      return {
        message: `${definition.title}: hoàn thành! +${definition.rewardCash}.000đ · +${definition.rewardScore} điểm.`,
        reward: { cash: definition.rewardCash, score: definition.rewardScore, delivery: definition.delivery },
      };
    }
    if (definition.timeLimitSeconds && step === 1) {
      return { message: `Xuất phát! Qua đủ sáu chốt trong ${definition.timeLimitSeconds} giây, chú ý an toàn.` };
    }
    return { message: `Đã xong chặng ${step}/${definition.steps.length}. ${definition.steps[step].objective}` };
  }

  return {
    view() {
      const objective = status === 'active' ? definition.steps[step] : null;
      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        objective: objective?.objective ?? (status === 'completed'
          ? 'Đã hoàn thành! Mở bảng nhiệm vụ để chọn chuyến mới hoặc chơi lại.'
          : 'Lượt đua kết thúc. Mở bảng nhiệm vụ và chọn Thử lại.'),
        label: objective?.label ?? (status === 'completed' ? 'Hoàn thành' : 'Thử lại'),
        step,
        total: definition.steps.length,
        target: objective ? { ...objective.target } : null,
        status,
        remainingSeconds: definition.timeLimitSeconds == null
          ? null
          : Math.max(0, Math.ceil(definition.timeLimitSeconds - elapsedSeconds)),
        started,
        rewardCash: definition.rewardCash,
        rewardScore: definition.rewardScore,
        completedIds: [...completedIds],
        requiresBike: objective?.requiresBike ?? false,
        requiresOnFoot: objective?.requiresOnFoot ?? false,
      };
    },
    select,
    reset() {
      completedIds.clear();
      select('coffee');
    },
    interact(player) {
      if (status !== 'active') return null;
      if (definition.timeLimitSeconds && started && player.down) {
        return fail('Bạn đã ngã xe. Mở bảng nhiệm vụ và chọn Thử lại để đua tiếp.');
      }
      const objective = definition.steps[step];
      if (!nearby(player, objective.target)) return null;
      const message = restriction(player, objective);
      if (message) return { message };
      // Checkpoint objectives only advance in update, so one key cannot skip steps.
      return objective.mode === 'interact' ? advance() : null;
    },
    update(dtSeconds, player) {
      if (status !== 'active') return null;
      if (definition.timeLimitSeconds && started) {
        if (player.down) return fail('Bạn đã ngã xe. Mở bảng nhiệm vụ và chọn Thử lại để đua tiếp.');
        if (Number.isFinite(dtSeconds)) elapsedSeconds += Math.max(0, dtSeconds);
        if (elapsedSeconds >= definition.timeLimitSeconds) {
          return fail('Hết giờ! Mở bảng nhiệm vụ và chọn Thử lại để chinh phục vòng đua.');
        }
      }
      const objective = definition.steps[step];
      if (objective.mode !== 'proximity' || !nearby(player, objective.target) || restriction(player, objective)) return null;
      return advance();
    },
  };
}
