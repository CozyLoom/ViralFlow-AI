import { AvatarPreset } from '../types/creator';
import creatorAvatarImg from '../assets/images/creator_avatar_1795421850716.jpg';
import studioHeroCinemaImg from '../assets/images/studio_hero_cinema_1795500268220.jpg';
import podcastSuiteImg from '../assets/images/podcast_suite_session_1795500269499.jpg';
import cinemaOpticsImg from '../assets/images/cinema_optics_desk_1795500270761.jpg';

export const AVATAR_OPTIONS: Array<{
  id: AvatarPreset;
  label: string;
  src: string | null;
}> = [
  { id: 'studio', label: 'Creator', src: creatorAvatarImg },
  { id: 'cinema', label: 'Cinema', src: studioHeroCinemaImg },
  { id: 'podcast', label: 'Podcast', src: podcastSuiteImg },
  { id: 'optics', label: 'Optics', src: cinemaOpticsImg },
  { id: 'initials', label: 'Monogram', src: null },
];

export function getAvatarImage(preset?: AvatarPreset | null): string | null {
  const match = AVATAR_OPTIONS.find((item) => item.id === preset);
  return match ? match.src : creatorAvatarImg;
}

export function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return 'VF';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}
