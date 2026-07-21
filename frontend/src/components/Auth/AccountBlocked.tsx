import React from "react";
import { motion } from "framer-motion";
import { THEME } from "@/utils/constants";

const AccountBlocked: React.FC = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: "easeOut" },
    },
  };

  const pulseVariants = {
    pulse: {
      scale: [1, 1.1, 1],
      transition: { duration: 2, repeat: Infinity },
    },
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: THEME.colors.background }}
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-md w-full rounded-xl p-8"
        style={{
          backgroundColor: THEME.colors.surface,
          boxShadow: THEME.shadows.xl,
        }}
      >
        {/* Icon */}
        <motion.div
          variants={itemVariants}
          className="w-20 h-20 mx-auto mb-6 flex items-center justify-center rounded-full"
          style={{ backgroundColor: `${THEME.colors.error}20` }}
        >
          <motion.svg
            variants={pulseVariants}
            animate="pulse"
            className="w-12 h-12"
            style={{ color: THEME.colors.error }}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 1a9 9 0 100 18 9 9 0 000-18zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </motion.svg>
        </motion.div>

        {/* Heading */}
        <motion.h1
          variants={itemVariants}
          className="text-2xl font-bold text-center mb-2"
          style={{ color: THEME.colors.error }}
        >
          Account Blocked
        </motion.h1>

        {/* Description */}
        <motion.p
          variants={itemVariants}
          className="text-center mb-4"
          style={{ color: THEME.colors.text.secondary }}
        >
          Your account has been locked for 24 hours due to suspicious activity.
        </motion.p>

        {/* Details */}
        <motion.div
          variants={itemVariants}
          className="rounded-lg p-4 mb-6"
          style={{
            backgroundColor: `${THEME.colors.error}10`,
            borderLeft: `3px solid ${THEME.colors.error}`,
          }}
        >
          <p
            className="text-sm"
            style={{ color: THEME.colors.text.secondary }}
          >
            <strong>Reason:</strong> Your refresh token was reused, indicating
            a potential security breach.
          </p>
          <p className="text-sm mt-2" style={{ color: THEME.colors.text.secondary }}>
            <strong>Action:</strong> For your security, please try logging in
            after 24 hours.
          </p>
        </motion.div>

        {/* Security Tips */}
        <motion.div variants={itemVariants}>
          <p
            className="text-xs font-semibold mb-3 uppercase tracking-wide"
            style={{ color: THEME.colors.text.muted }}
          >
            Security Tips
          </p>
          <ul className="text-xs space-y-2" style={{ color: THEME.colors.text.secondary }}>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Change your password after regaining access</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Enable two-factor authentication (2FA)</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Review active sessions and revoke unauthorized ones</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Contact support if you believe this is an error</span>
            </li>
          </ul>
        </motion.div>

        {/* Footer Message */}
        <motion.div
          variants={itemVariants}
          className="mt-8 pt-6"
          style={{ borderTop: `1px solid ${THEME.colors.surfaceLight}` }}
        >
          <p
            className="text-xs text-center"
            style={{ color: THEME.colors.text.muted }}
          >
            Your account will automatically unlock in 24 hours
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default AccountBlocked;
