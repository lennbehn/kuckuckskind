import { ChickArt } from './ChickArt.tsx';
import { MOODS, mixParams, type ChickParams } from './chickParams.ts';

/** Kleines, ruhendes Küken für Listen (Stimmung aus dem Befinden); für Screenreader ausgeblendet. */
export function MiniChick({
  wellbeing = 1,
  alive = true,
  size = 44,
  params,
}: {
  wellbeing?: number;
  alive?: boolean;
  size?: number;
  params?: ChickParams;
}) {
  const p =
    params ??
    (!alive
      ? MOODS.gone
      : wellbeing >= 0.75
        ? MOODS.happy
        : wellbeing >= 0.45
          ? mixParams(MOODS.worried, MOODS.content, (wellbeing - 0.45) / 0.3)
          : MOODS.sad);
  return (
    // Rein dekorativ: Name und Zustand stehen als Text daneben.
    <span className={`mini-chick ${alive ? '' : 'chick-gone'}`} aria-hidden="true">
      <ChickArt
        params={p}
        size={size}
        nest={false}
        title={alive ? 'Küken' : 'Küken ist nicht mehr da'}
      />
    </span>
  );
}
