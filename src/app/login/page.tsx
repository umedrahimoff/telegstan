"use client";

import { useState } from "react";
import axios from "axios";
import { Lock, Loader2, ArrowRight } from "lucide-react";

export default function LoginPage() {
    const [step, setStep] = useState(1);
    const [username, setUsername] = useState("");
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [codeSentTo, setCodeSentTo] = useState("");

    const requestLogin = async () => {
        const u = username.trim().replace(/^@/, "").toLowerCase();
        if (!u) {
            setError("Enter your username");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const res = await axios.post("/api/auth/request", { username: u });
            setCodeSentTo(`@${u}`);
            setStep(2);
        } catch (err: any) {
            setError(err.response?.data?.error || "Failed to send code");
        } finally {
            setLoading(false);
        }
    };

    const verifyCode = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await axios.post("/api/auth/verify", { code: code.trim() });
            if (res.data.success) {
                window.location.href = res.data.redirect || "/dashboard";
            }
        } catch (err: any) {
            setError(err.response?.data?.error || "Invalid code");
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setLoading(true);
        setError("");
        try {
            await axios.post("/api/auth/request", { username: username.trim().replace(/^@/, "").toLowerCase() });
            setCode("");
        } catch (err: any) {
            setError(err.response?.data?.error || "Failed to send code");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: '#0D0E12',
            backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(0, 163, 255, 0.05) 0%, rgba(0, 0, 0, 0) 70%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            color: 'white',
            fontFamily: 'Inter, sans-serif'
        }}>
            <div className="card animate-fade" style={{ maxWidth: '400px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '20px',
                    background: 'rgba(0,163,255,0.1)',
                    border: '1px solid rgba(0,163,255,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1.5rem'
                }}>
                    <Lock color="#00A3FF" size={28} />
                </div>

                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.75rem' }}>
                    {step === 1 ? "Sign In" : "Enter Code"}
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.95rem', marginBottom: '2rem' }}>
                    {step === 1
                        ? "Enter your Telegram username. A one-time code will be sent to you."
                        : `A 6-digit code was sent to ${codeSentTo}.`}
                </p>

                {error && (
                    <div style={{
                        background: 'rgba(255,69,69,0.1)',
                        color: '#FF4545',
                        padding: '0.8rem',
                        borderRadius: '10px',
                        fontSize: '0.85rem',
                        marginBottom: '1.5rem',
                        border: '1px solid rgba(255,69,69,0.2)'
                    }}>
                        {error}
                    </div>
                )}

                {step === 1 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <input
                            className="input-field"
                            type="text"
                            placeholder="@username"
                            style={{ height: '52px', fontSize: '1rem', textAlign: 'center' }}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && requestLogin()}
                        />
                        <button
                            className="btn-primary"
                            onClick={requestLogin}
                            style={{ width: '100%', height: '52px', fontSize: '1rem' }}
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : "Send Code"}
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <input
                            className="input-field"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="000000"
                            style={{ textAlign: 'center', letterSpacing: '0.5em', fontSize: '1.25rem', height: '60px' }}
                            value={code}
                            maxLength={6}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                            onKeyDown={(e) => e.key === 'Enter' && verifyCode()}
                        />
                        <button
                            className="btn-primary"
                            onClick={verifyCode}
                            style={{ width: '100%', height: '52px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            disabled={loading || code.length !== 6}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <>Verify & Enter <ArrowRight size={18} /></>}
                        </button>
                        <button
                            type="button"
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
                            onClick={handleResend}
                            disabled={loading}
                        >
                            Resend code
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
