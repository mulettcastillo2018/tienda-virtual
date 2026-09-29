import {
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  Camera,
  Car,
  Coffee,
  Cpu,
  Dumbbell,
  Flower2,
  Gamepad2,
  Gift,
  Glasses,
  HeartPulse,
  Home,
  Lamp,
  Music,
  PawPrint,
  Palette,
  Plane,
  Puzzle,
  ShoppingBag,
  Shirt,
  Smartphone,
  Sparkles,
  Tag,
  Tv,
  Utensils,
  Watch,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// Debe mantenerse en sincronía con backend/src/lib/categoryIcons.ts.
const ICONS_BY_NAME: Record<string, LucideIcon> = {
  Dumbbell,
  Cpu,
  Home,
  Shirt,
  Sparkles,
  Baby,
  PawPrint,
  Gamepad2,
  HeartPulse,
  Briefcase,
  Wrench,
  Car,
  BookOpen,
  Music,
  Camera,
  Utensils,
  Palette,
  Gift,
  Watch,
  Glasses,
  Bike,
  Plane,
  ShoppingBag,
  Smartphone,
  Tv,
  Lamp,
  Flower2,
  Coffee,
  Puzzle,
  Tag,
};

export const CATEGORY_ICON_OPTIONS = Object.keys(ICONS_BY_NAME) as Array<keyof typeof ICONS_BY_NAME>;

// Categorías creadas antes de que existiera el selector de íconos no tienen
// `icon` guardado; para ellas se conserva este mapeo automático por slug.
const ICONS_BY_SLUG: Record<string, LucideIcon> = {
  deportes: Dumbbell,
  electronica: Cpu,
  hogar: Home,
  moda: Shirt,
  belleza: Sparkles,
  bebes: Baby,
  mascotas: PawPrint,
  juguetes: Gamepad2,
  salud: HeartPulse,
  oficina: Briefcase,
  herramientas: Wrench,
  vehiculos: Car,
};

export function getCategoryIcon(icon: string | null | undefined, slug: string): LucideIcon {
  if (icon && ICONS_BY_NAME[icon]) return ICONS_BY_NAME[icon];
  return ICONS_BY_SLUG[slug] ?? Tag;
}
