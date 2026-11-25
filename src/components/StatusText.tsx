import React from 'react';
import { DossierStatus } from '../types';

interface StatusTextProps {
  status: DossierStatus;
}

export const StatusText: React.FC<StatusTextProps> = ({ status }) => {
  const colorClass =
    status === 'Đã hoàn tất'
      ? 'text-[#166534] font-bold'
      : status === 'Cần bổ sung'
        ? 'text-[#8E1018] font-bold'
        : status === 'Đang rà soát'
          ? 'text-[#92400E] font-bold'
          : status === 'Chờ Chi bộ kiểm tra'
            ? 'text-[#1D4ED8] font-bold'
            : 'text-[#524647] font-semibold';

  return <span className={`whitespace-nowrap ${colorClass}`}>{status}</span>;
};
