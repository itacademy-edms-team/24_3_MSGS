import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AppSidebarNav from "../components/AppSidebarNav";
import { api } from "../services/api";
import type {
  EmailVerificationStatus,
  ReceivedShare,
  SentShareGroup,
  ShareProfile
} from "../types";
import { useVoiceAssistant } from "../voice/VoiceAssistantContext";

function formatPermission(permission: string) {
  const normalized = permission.toLowerCase();
  if (normalized === "edit" || normalized === "write") {
    return "Редактирование";
  }
  return "Только просмотр";
}

export default function ProfilePage() {
  const { user, token, refreshUser } = useAuth();
  const {
    supported: voiceSupported,
    alwaysListenEnabled,
    setAlwaysListenEnabled,
    wakeListening
  } = useVoiceAssistant();
  const [profile, setProfile] = useState<ShareProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailVerificationStatus | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const showStatus = (message: string, timeout = 4000) => {
    setStatus(message);
    if (timeout > 0) {
      setTimeout(() => setStatus(null), timeout);
    }
  };

  const loadProfile = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getShareProfile(token);
      setProfile(data);
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка загрузки профиля",
        6000
      );
    }
  }, [token]);

  const loadEmailStatus = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getEmailVerificationStatus(token);
      setEmailStatus(data);
      setResendCountdown(
        data.resendAvailableInSeconds && data.resendAvailableInSeconds > 0
          ? data.resendAvailableInSeconds
          : 0
      );
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Не удалось загрузить статус email",
        6000
      );
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    void Promise.all([loadProfile(), refreshUser(), loadEmailStatus()]).finally(() =>
      setLoading(false)
    );
  }, [loadProfile, refreshUser, loadEmailStatus]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCountdown]);

  const handleSendCode = async () => {
    if (!token || emailBusy) return;
    setEmailBusy(true);
    try {
      const result = await api.sendEmailVerificationCode(token);
      showStatus(result.message, 6000);
      await loadEmailStatus();
      setResendCountdown(60);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Не удалось отправить код", 6000);
    } finally {
      setEmailBusy(false);
    }
  };

  const handleConfirmEmail = async () => {
    if (!token || emailBusy) return;
    const code = verificationCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      showStatus("Введите 6-значный код из письма", 5000);
      return;
    }
    setEmailBusy(true);
    try {
      await api.confirmEmail(token, code);
      setVerificationCode("");
      await refreshUser();
      await loadEmailStatus();
      showStatus("Email успешно подтверждён", 6000);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Неверный код", 6000);
    } finally {
      setEmailBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="fullscreen-center">
        <div className="spinner" />
        <p>Загружаем профиль...</p>
      </div>
    );
  }

  const received = profile?.received ?? [];
  const sent = profile?.sent ?? [];

  return (
    <div className="dashboard profile-dashboard">
      <aside className="sidebar">
        <AppSidebarNav />
      </aside>

      <section className="notes-panel profile-panel">
        <header className="panel-header">
          <div>
            <h2>Профиль</h2>
            <p className="note-meta">
              {user?.username} • {user?.email}
              {user?.emailConfirmed ? (
                <span className="email-confirmed-badge"> • подтверждён</span>
              ) : (
                <span className="email-unconfirmed-badge"> • не подтверждён</span>
              )}
            </p>
          </div>
        </header>

        <div className="profile-settings-block">
          <h3 className="profile-shares-heading">Подтверждение email</h3>
          {emailStatus?.emailConfirmed || user?.emailConfirmed ? (
            <p className="note-meta profile-settings-hint">
              Адрес <strong>{emailStatus?.email ?? user?.email}</strong> подтверждён.
            </p>
          ) : (
            <>
              <p className="note-meta profile-settings-hint">
                На <strong>{emailStatus?.email ?? user?.email}</strong> будет отправлен
                6-значный код. Код действует 15 минут.
              </p>
              <div className="profile-email-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={emailBusy || resendCountdown > 0}
                  onClick={() => void handleSendCode()}
                >
                  {resendCountdown > 0
                    ? `Отправить снова (${resendCountdown} с)`
                    : "Отправить код на почту"}
                </button>
              </div>
              <div className="profile-email-confirm-row">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="profile-email-code-input"
                  placeholder="000000"
                  value={verificationCode}
                  disabled={emailBusy}
                  onChange={(e) =>
                    setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                <button
                  type="button"
                  className="btn ghost"
                  disabled={emailBusy || verificationCode.length !== 6}
                  onClick={() => void handleConfirmEmail()}
                >
                  Подтвердить email
                </button>
              </div>
            </>
          )}
        </div>

        <div className="profile-settings-block">
          <h3 className="profile-shares-heading">Голосовой помощник</h3>
          <label className="profile-settings-toggle">
            <input
              type="checkbox"
              checked={alwaysListenEnabled}
              disabled={!voiceSupported}
              onChange={(e) => {
                setAlwaysListenEnabled(e.target.checked);
                showStatus(
                  e.target.checked
                    ? "Постоянное прослушивание включено — скажите «Голосовой ввод»"
                    : "Постоянное прослушивание выключено",
                  5000
                );
              }}
            />
            <span>Постоянное прослушивание фразы «Голосовой ввод»</span>
          </label>
          <p className="note-meta profile-settings-hint">
            {voiceSupported
              ? alwaysListenEnabled
                ? wakeListening
                  ? "Микрофон активен — произнесите «Голосовой ввод», затем команду (на странице заметок)."
                  : "После включения откройте раздел «Заметки» или дождитесь доступа к микрофону."
                : "Без этой опции помощник включается только кнопкой 🎤 на странице заметок."
              : "Голосовой помощник недоступен в этом браузере (нужен Chrome, Edge или Safari)."}
          </p>
        </div>

        <div className="profile-shares-grid">
          <div className="profile-shares-column">
            <h3 className="profile-shares-heading">
              Со мной поделились ({received.length})
            </h3>
            {received.length === 0 ? (
              <p className="empty-state">Пока никто не поделился с вами заметками</p>
            ) : (
              <ul className="notes-list">
                {received.map((share: ReceivedShare) => (
                  <li key={share.shareId}>
                    <div>
                      <p className="note-title">{share.noteTitle}</p>
                      <p className="note-meta">
                        От {share.ownerUsername} • {formatPermission(share.permission)} •{" "}
                        {new Date(share.sharedAt).toLocaleString()}
                      </p>
                    </div>
                    <Link className="btn ghost" to={`/app?noteId=${share.noteId}`}>
                      Открыть
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="profile-shares-column">
            <h3 className="profile-shares-heading">
              Я поделился ({sent.length})
            </h3>
            {sent.length === 0 ? (
              <p className="empty-state">Вы ещё не делились своими заметками</p>
            ) : (
              <ul className="notes-list">
                {sent.map((group: SentShareGroup) => (
                  <li key={group.noteId}>
                    <div style={{ flex: 1 }}>
                      <p className="note-title">{group.noteTitle}</p>
                      <ul className="profile-recipients-list">
                        {group.recipients.map((recipient) => (
                          <li key={recipient.shareId} className="note-meta">
                            {recipient.username} — {formatPermission(recipient.permission)} •{" "}
                            {new Date(recipient.sharedAt).toLocaleString()}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Link className="btn ghost" to={`/app?noteId=${group.noteId}`}>
                      Открыть
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {status && (
        <div className="toast">
          <span>{status}</span>
        </div>
      )}
    </div>
  );
}
