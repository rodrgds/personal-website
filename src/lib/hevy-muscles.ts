export const HEVY_MUSCLE_GROUPS = [
  "abdominals",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quadriceps",
  "hamstrings",
  "calves",
  "glutes",
  "abductors",
  "adductors",
  "lats",
  "upper_back",
  "traps",
  "lower_back",
  "chest",
  "neck",
] as const;

export type HevyMuscleGroup = (typeof HEVY_MUSCLE_GROUPS)[number];

export interface MuscleTraining {
  group: HevyMuscleGroup;
  label: string;
  exposure: number;
  workouts: number;
  level: number;
}

export const HEVY_MUSCLE_LABELS = {
  abdominals: "Abdominals",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quadriceps: "Quadriceps",
  hamstrings: "Hamstrings",
  calves: "Calves",
  glutes: "Glutes",
  abductors: "Abductors",
  adductors: "Adductors",
  lats: "Lats",
  upper_back: "Upper back",
  traps: "Traps",
  lower_back: "Lower back",
  chest: "Chest",
  neck: "Neck",
} satisfies Record<HevyMuscleGroup, string>;

export function isHevyMuscleGroup(value: string): value is HevyMuscleGroup {
  return HEVY_MUSCLE_GROUPS.some((group) => group === value);
}

export function muscleTrainingLevel(
  exposure: number,
  maximumExposure: number,
): number {
  if (exposure <= 0 || maximumExposure <= 0) return 0;

  return Math.min(4, Math.max(1, Math.ceil((exposure / maximumExposure) * 4)));
}
