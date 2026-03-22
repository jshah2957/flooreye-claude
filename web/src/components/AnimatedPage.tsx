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
