import type { CareMethod, GameConfig } from '@kuckuckskind/shared';

export interface StepProps {
  config: GameConfig;
  onDone: (method: CareMethod) => void;
}
