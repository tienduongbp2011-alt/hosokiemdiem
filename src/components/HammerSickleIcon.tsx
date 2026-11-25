import React from 'react';

interface HammerSickleIconProps {
  className?: string;
}

export const HammerSickleIcon: React.FC<HammerSickleIconProps> = ({
  className = 'w-10 h-10',
}) => {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Subtle gold circle framing */}
      <circle
        cx="32"
        cy="32"
        r="30"
        stroke="#F6CF62"
        strokeWidth="2"
        fill="#760C13"
      />
      {/* Sickle crescent blade */}
      <path
        d="M36.5 12.5C46.5 16.2 51.8 27.4 48.2 37.6C44.8 47.2 34.4 52.3 24.7 49.1C22.4 48.3 20.4 47.1 18.7 45.6L21.9 42.3C23.2 43.3 24.7 44.1 26.3 44.6C33.4 46.8 40.9 43.0 43.2 35.9C45.4 29.0 42.0 21.6 35.6 18.6L36.5 12.5Z"
        fill="#F6CF62"
      />
      {/* Sickle handle */}
      <path
        d="M21.4 43.5L13.5 51.2C12.5 52.2 12.5 53.7 13.5 54.6C14.5 55.5 16.0 55.5 16.9 54.5L24.5 46.5L21.4 43.5Z"
        fill="#F6CF62"
      />
      {/* Hammer handle (diagonal) */}
      <path
        d="M22.2 21.0L48.6 47.4C49.5 48.3 49.5 49.8 48.6 50.8C47.6 51.7 46.1 51.7 45.2 50.8L18.8 24.4L22.2 21.0Z"
        fill="#F6CF62"
      />
      {/* Hammer head */}
      <path
        d="M26.5 14.5L13.8 27.2L18.6 32.0L24.4 26.2L29.6 21.0L32.8 17.8L26.5 14.5Z"
        fill="#F6CF62"
      />
    </svg>
  );
};
