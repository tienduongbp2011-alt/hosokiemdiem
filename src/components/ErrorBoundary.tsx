import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Đã xảy ra lỗi không mong muốn.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let displayDetail = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed.error) {
          displayDetail = `${parsed.error}${
            parsed.path ? ` (Đường dẫn: ${parsed.path})` : ''
          }`;
        }
      } catch {
        // Plain text error
      }

      return (
        <div className="min-h-screen bg-[#FAF8F3] flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-white border-2 border-[#8E1018] shadow-lg">
            <div className="bg-[#8E1018] text-white px-5 py-3.5 border-b-2 border-[#F6CF62] font-bold text-lg">
              Thông báo sự cố kết nối dữ liệu
            </div>
            <div className="p-5 space-y-3 text-[15px] text-[#2b1416]">
              <p className="m-0">
                Ứng dụng gặp lỗi khi truy xuất cơ sở dữ liệu trực tuyến. Vui lòng tải lại trang hoặc kiểm tra lại quyền đăng nhập.
              </p>
              <div className="bg-[#FDF1F2] border border-[#d5969a] p-3 text-sm text-[#8E1018] break-words">
                {displayDetail}
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-[#8E1018] text-white font-bold hover:bg-[#730B12]"
              >
                Tải lại trang
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
