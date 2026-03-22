import { Variants } from 'framer-motion';

// Page transitions
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

// Fade in
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
};

// Slide up (for modals, drawers)
export const slideUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, y: 20, transition: { duration: 0.15 } },
};

// Slide right (for drawers)
export const slideRight: Variants = {
  initial: { x: '100%' },
  animate: { x: 0, transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] } },
  exit: { x: '100%', transition: { duration: 0.2 } },
};

// Scale in (for tooltips, popovers)
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.1 } },
};

// Stagger children (for lists, grids)
export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.05 } },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

// Number counter animation config
export const counterSpring = { type: 'spring' as const, stiffness: 100, damping: 30 };
