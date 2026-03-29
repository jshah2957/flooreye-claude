// DEAD CODE — Safe to delete (along with lib/animations.ts). Verified 2026-03-29.
// This component was part of the Session 28 UI redesign for page transitions,
// but was removed from all page wrappers. No page or route imports AnimatedPage.
// grep "AnimatedPage" across web/src/: 0 imports (only this file).
// Also makes lib/animations.ts dead (its only consumer is this file).
// Removing both files has zero impact on any page rendering.
import { motion } from 'framer-motion';
import { pageVariants } from '../lib/animations';
import { ReactNode } from 'react';

export function AnimatedPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  );
}
