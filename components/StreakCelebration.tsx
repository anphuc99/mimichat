import React, { useEffect, useState } from 'react';

interface StreakCelebrationProps {
  streakCount: number;
  show: boolean;
  onComplete?: () => void;
}

export const StreakCelebration: React.FC<StreakCelebrationProps> = ({ 
  streakCount, 
  show, 
  onComplete 
}) => {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string; delay: number }>>([]);

  useEffect(() => {
    if (show) {
      // Generate random particles
      const newParticles = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        color: ['#FF6B35', '#F7931E', '#FDC830', '#FF6B9D', '#C471ED'][Math.floor(Math.random() * 5)],
        delay: Math.random() * 0.5
      }));
      setParticles(newParticles);

      // Auto complete after animation
      const timer = setTimeout(() => {
        onComplete?.();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show) return null;

  const getMilestoneMessage = (count: number) => {
    if (count >= 100) return '🏆 Huyền thoại! 100 ngày!';
    if (count >= 50) return '⭐ Xuất sắc! 50 ngày!';
    if (count >= 30) return '💎 Tuyệt vời! 30 ngày!';
    if (count >= 7) return '🔥 Tuần đầu hoàn thành!';
    if (count === 1) return '🎉 Bắt đầu streak!';
    return `🔥 Streak ${count} ngày!`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* Overlay with fade */}
      <div className="absolute inset-0 bg-black/20 animate-fade-in" />

      {/* Particles */}
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute w-3 h-3 rounded-full animate-float-up"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            backgroundColor: particle.color,
            animationDelay: `${particle.delay}s`,
            boxShadow: `0 0 10px ${particle.color}`
          }}
        />
      ))}

      {/* Main celebration card */}
      <div className="relative bg-white rounded-3xl shadow-2xl p-8 animate-scale-bounce border-4 border-orange-400">
        {/* Fire emoji animation */}
        <div className="text-center mb-4">
          <div className="inline-block text-8xl animate-bounce-fire">
            🔥
          </div>
        </div>

        {/* Streak count with gradient */}
        <div className="text-center mb-4">
          <div className="text-7xl font-black bg-gradient-to-r from-orange-500 via-yellow-500 to-red-500 bg-clip-text text-transparent animate-pulse-glow">
            {streakCount}
          </div>
          <div className="text-2xl font-bold text-gray-700 mt-2">
            {getMilestoneMessage(streakCount)}
          </div>
        </div>

        {/* Sparkle effects */}
        <div className="absolute -top-4 -left-4 text-4xl animate-spin-slow">✨</div>
        <div className="absolute -top-4 -right-4 text-4xl animate-spin-slow" style={{ animationDelay: '0.5s' }}>✨</div>
        <div className="absolute -bottom-4 -left-4 text-4xl animate-spin-slow" style={{ animationDelay: '1s' }}>✨</div>
        <div className="absolute -bottom-4 -right-4 text-4xl animate-spin-slow" style={{ animationDelay: '1.5s' }}>✨</div>

        {/* Continue message */}
        <div className="text-center text-gray-600 font-medium mt-4">
          Tiếp tục phấn đấu! 💪
        </div>
      </div>

      {/* Additional CSS animations via inline style tag */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes float-up {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(-100vh) scale(0);
            opacity: 0;
          }
        }

        @keyframes scale-bounce {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes bounce-fire {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-20px) scale(1.2);
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            filter: drop-shadow(0 0 10px rgba(255, 107, 53, 0.8));
          }
          50% {
            filter: drop-shadow(0 0 30px rgba(255, 107, 53, 1));
          }
        }

        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }

        .animate-float-up {
          animation: float-up 2s ease-out forwards;
        }

        .animate-scale-bounce {
          animation: scale-bounce 0.5s ease-out;
        }

        .animate-bounce-fire {
          animation: bounce-fire 1s ease-in-out infinite;
        }

        .animate-pulse-glow {
          animation: pulse-glow 1.5s ease-in-out infinite;
        }

        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>
  );
};
