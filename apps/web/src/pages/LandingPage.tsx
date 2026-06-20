import { useScroll, useTransform, motion, useReducedMotion } from 'motion/react';
import { useRef } from 'react';
import owlLogo from '../assets/owl-logo.png';
import {
  FileSearch, Calculator, ShieldAlert, Mic,
  Lock, ArrowRight, ChevronRight, Zap, Phone
} from 'lucide-react';
import HeroOrb from '../components/HeroOrb';
import type { Page } from '../types';

interface LandingPageProps {
  onNavigate: (page: Page) => void;
}

const features = [
  {
    icon: FileSearch,
    title: 'Conciliación Fiscal Automatizada',
    body: 'Descarga y lectura inteligente de facturas emitidas y recibidas directamente del SAT. XML y PDF procesados sin intervención manual.',
    size: 'large',
    accent: 'emerald',
  },
  {
    icon: Calculator,
    title: 'Cálculo de Impuestos al Instante',
    body: 'IVA e ISR proyectados en tiempo real. Sin sorpresas al final del mes.',
    size: 'medium',
    accent: 'cyan',
  },
  {
    icon: ShieldAlert,
    title: 'Auditoría Anti-Multas',
    body: 'Detección automática de discrepancias, EFOS y estatus de cumplimiento negativo antes de que el SAT te contacte.',
    size: 'medium',
    accent: 'amber',
  },
  {
    icon: Mic,
    title: 'Interfaz de Voz de Nueva Generación',
    body: 'Pregúntale directamente a tu orbe cuántos impuestos debes pagar hoy. Sin menús complejos. Solo tu voz.',
    size: 'large',
    accent: 'indigo',
  },
];

const accentMap = {
  emerald: {
    icon: 'text-emerald',
    iconBg: 'bg-emerald-lo',
    glow: 'oklch(0.72 0.17 162)',
    border: 'hover:border-emerald/30',
  },
  cyan: {
    icon: 'text-sky-400',
    iconBg: 'bg-sky-950/40',
    glow: 'oklch(0.68 0.18 210)',
    border: 'hover:border-sky-500/30',
  },
  amber: {
    icon: 'text-amber-400',
    iconBg: 'bg-amber-950/40',
    glow: 'oklch(0.78 0.16 85)',
    border: 'hover:border-amber-500/30',
  },
  indigo: {
    icon: 'text-indigo-400',
    iconBg: 'bg-indigo-950/40',
    glow: 'oklch(0.55 0.18 280)',
    border: 'hover:border-indigo-500/30',
  },
};

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const prefersReducedMotion = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const navShadow = useTransform(scrollY, [0, 60], [0, 1]);

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col overflow-x-hidden">

      {/* Background glow spots — depth layer */}
      <div
        className="fixed inset-0 pointer-events-none select-none"
        aria-hidden="true"
        style={{ zIndex: 0 }}
      >
        {/* Top-left emerald wash */}
        <div
          className="absolute rounded-full blur-[120px] opacity-[0.07]"
          style={{
            width: 700, height: 700,
            top: -200, left: -200,
            background: 'radial-gradient(circle, oklch(0.72 0.17 162) 0%, transparent 70%)',
          }}
        />
        {/* Top-right indigo wash */}
        <div
          className="absolute rounded-full blur-[140px] opacity-[0.06]"
          style={{
            width: 600, height: 600,
            top: -100, right: -100,
            background: 'radial-gradient(circle, oklch(0.55 0.18 280) 0%, transparent 70%)',
          }}
        />
        {/* Center subtle glow */}
        <div
          className="absolute rounded-full blur-[180px] opacity-[0.04]"
          style={{
            width: 900, height: 500,
            top: '40%', left: '50%', transform: 'translateX(-50%)',
            background: 'radial-gradient(ellipse, oklch(0.55 0.16 230) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Navbar */}
      <header
        className="sticky top-0 border-b border-border"
        style={{ zIndex: 'var(--z-sticky)' }}
        role="banner"
      >
        <motion.div
          className="absolute inset-0 bg-bg/85 backdrop-blur-md"
          style={{ opacity: navShadow }}
        />
        <div
          className="absolute inset-0 bg-bg/60 backdrop-blur-md"
          aria-hidden="true"
        />
        <nav
          className="relative max-w-6xl mx-auto px-6 h-14 flex items-center justify-between"
          aria-label="Navegación principal"
        >
          <div className="flex items-center gap-2">
            <img src={owlLogo} alt="" aria-hidden="true" className="w-7 h-7 rounded-full object-cover" style={{ objectPosition: 'center 18%' }} />
            <span className="font-semibold text-ink tracking-tight">SATI</span>
          </div>

          <div className="hidden sm:flex items-center gap-7 text-sm text-muted">
            <a href="#servicios" className="hover:text-ink transition-colors duration-150">Servicios</a>
            <a href="#demo" className="hover:text-ink transition-colors duration-150">Demo</a>
            <a href="#seguridad" className="hover:text-ink transition-colors duration-150">Seguridad</a>
          </div>

          <motion.button
            type="button"
            onClick={() => onNavigate('auth')}
            className="h-8 px-4 rounded-full bg-surface border border-border text-sm font-medium text-ink"
            whileHover={{ borderColor: 'oklch(0.72 0.17 162)', color: 'oklch(0.72 0.17 162)' }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15 }}
          >
            Iniciar sesión
          </motion.button>
        </nav>
      </header>

      <main style={{ position: 'relative', zIndex: 1 }}>
        {/* Hero */}
        <section
          ref={heroRef}
          className="max-w-6xl mx-auto px-6 pt-20 pb-28 grid lg:grid-cols-2 gap-12 items-center"
          aria-labelledby="hero-heading"
        >
          <div className="flex flex-col gap-8">
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Pill label */}
              <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-emerald/25 bg-emerald-lo text-xs font-medium text-emerald">
                <Zap size={11} aria-hidden="true" />
                Conectado al SAT en tiempo real
              </div>

              <h1
                id="hero-heading"
                className="text-5xl lg:text-[3.5rem] font-semibold tracking-[-0.03em] leading-[1.08]"
                style={{ textWrap: 'balance' } as React.CSSProperties}
              >
                Tu contabilidad,{' '}
                <span className="text-emerald">resuelta</span>{' '}
                con voz.
              </h1>
              <p
                className="mt-5 text-base text-muted leading-relaxed max-w-[52ch]"
                style={{ textWrap: 'pretty' } as React.CSSProperties}
              >
                El primer asistente financiero con IA que se conecta a tu portal SAT,
                descarga tus facturas y calcula tus impuestos en tiempo real.
                Pregúntale en voz alta; responde al instante.
              </p>
            </motion.div>

            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-wrap gap-3"
            >
              <motion.button
                type="button"
                onClick={() => onNavigate('auth')}
                className="btn-shine h-11 px-7 rounded-full bg-emerald text-bg text-sm font-semibold flex items-center gap-2"
                whileHover={{ scale: 1.03, boxShadow: '0 0 28px oklch(0.72 0.17 162 / 0.45)' }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                Prueba SATI Gratis
                <ArrowRight size={15} aria-hidden="true" />
              </motion.button>
              <motion.button
                type="button"
                onClick={() => onNavigate('auth')}
                className="h-11 px-5 rounded-full border border-border text-sm text-muted flex items-center gap-2"
                whileHover={{ borderColor: 'oklch(0.96 0.003 257 / 0.4)', color: 'oklch(0.96 0.003 257)' }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.15 }}
              >
                Ver demo <ChevronRight size={15} aria-hidden="true" />
              </motion.button>
            </motion.div>

            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="flex items-center gap-2 text-xs text-subtle"
            >
              <Lock size={12} aria-hidden="true" />
              Sin tarjeta de crédito · Cancela cuando quieras
            </motion.div>
          </div>

          {/* Interactive Orb */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.88, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-center lg:justify-end"
          >
            <HeroOrb />
          </motion.div>
        </section>

        {/* Features */}
        <section
          id="servicios"
          className="max-w-6xl mx-auto px-6 pb-28"
          aria-labelledby="servicios-heading"
        >
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2
              id="servicios-heading"
              className="text-2xl font-semibold tracking-[-0.02em] mb-2"
              style={{ textWrap: 'balance' } as React.CSSProperties}
            >
              Todo lo que necesitas, sin la complejidad.
            </h2>
            <p className="text-muted text-sm mb-10 max-w-[55ch]">
              SATI habla directamente con el SAT. Tú solo preguntas.
            </p>
          </motion.div>

          {/* Asymmetric feature grid */}
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}
          >
            {features.map((f, i) => {
              const Icon = f.icon;
              const accent = accentMap[f.accent as keyof typeof accentMap];
              const colSpan =
                i === 0 ? 'col-span-12 md:col-span-7' :
                i === 1 ? 'col-span-12 md:col-span-5' :
                i === 2 ? 'col-span-12 md:col-span-5' :
                          'col-span-12 md:col-span-7';
              const paddingSize = f.size === 'large' ? 'p-8 min-h-[220px]' : 'p-6 min-h-[180px]';

              return (
                <motion.article
                  key={f.title}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -4, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.55, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                  className={`${colSpan} bg-surface border border-border rounded-xl ${paddingSize} flex flex-col gap-4 relative overflow-hidden cursor-default ${accent.border} transition-colors duration-200 group`}
                  style={{ willChange: 'transform' }}
                >
                  {/* Accent glow on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl"
                    style={{
                      background: `radial-gradient(ellipse at 20% 20%, ${accent.glow} / 0.08) 0%, transparent 60%)`,
                    }}
                    aria-hidden="true"
                  />

                  <div
                    className={`w-9 h-9 rounded-lg ${accent.iconBg} flex items-center justify-center shrink-0`}
                    aria-hidden="true"
                  >
                    <Icon size={18} className={accent.icon} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-ink mb-2 tracking-tight">{f.title}</h3>
                    <p
                      className="text-sm text-muted leading-relaxed"
                      style={{ textWrap: 'pretty' } as React.CSSProperties}
                    >
                      {f.body}
                    </p>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>

        {/* Phone Demo */}
        <section
          id="demo"
          className="max-w-6xl mx-auto px-6 pb-28"
          aria-labelledby="demo-heading"
        >
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="relative rounded-2xl border border-emerald/20 bg-surface overflow-hidden p-10 md:p-14 text-center"
          >
            {/* Glow background */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at 50% 0%, oklch(0.72 0.17 162 / 0.07) 0%, transparent 65%)',
              }}
              aria-hidden="true"
            />

            {/* Phone icon */}
            <div className="relative inline-flex w-14 h-14 rounded-2xl bg-emerald-lo border border-emerald/20 items-center justify-center mb-6">
              <Phone size={22} className="text-emerald" />
              {/* Pulse ring */}
              <span className="absolute inset-0 rounded-2xl border border-emerald/30 animate-ping opacity-40" aria-hidden="true" />
            </div>

            <h2
              id="demo-heading"
              className="relative text-2xl md:text-3xl font-semibold tracking-[-0.02em] mb-3"
              style={{ textWrap: 'balance' } as React.CSSProperties}
            >
              Prueba SATI ahora mismo
            </h2>
            <p className="relative text-muted text-sm mb-8 max-w-[46ch] mx-auto" style={{ textWrap: 'pretty' } as React.CSSProperties}>
              Llama a este número y habla con SATI en voz real. Pregúntale sobre impuestos, regímenes fiscales o el SAT. Sin registro, sin apps.
            </p>

            {/* Phone number */}
            <div className="relative inline-flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-bg border border-border mb-8">
              <Phone size={16} className="text-emerald shrink-0" aria-hidden="true" />
              <span className="text-xl font-semibold tracking-wide text-ink">+1 (434) 922-9195</span>
            </div>

            {/* Call button */}
            <div className="relative">
              <motion.a
                href="tel:+14349229195"
                className="btn-shine inline-flex items-center gap-2 h-11 px-8 rounded-full bg-emerald text-bg font-semibold text-sm"
                whileHover={{ scale: 1.04, boxShadow: '0 0 32px oklch(0.72 0.17 162 / 0.50)' }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                <Phone size={15} aria-hidden="true" />
                Llamar ahora
              </motion.a>
            </div>

            <p className="relative mt-5 text-xs text-subtle">
              Demo pública · Sin acceso a tus datos reales del SAT
            </p>
          </motion.div>
        </section>

        {/* Security */}
        <section
          id="seguridad"
          className="relative border-y border-border overflow-hidden"
          aria-labelledby="seguridad-heading"
        >
          {/* Section bg depth */}
          <div className="absolute inset-0 bg-surface" aria-hidden="true" />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at 80% 50%, oklch(0.72 0.17 162 / 0.04) 0%, transparent 60%)',
            }}
            aria-hidden="true"
          />

          <div className="relative max-w-6xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-emerald-lo flex items-center justify-center" aria-hidden="true">
                  <Lock size={15} className="text-emerald" />
                </div>
                <span className="text-xs font-semibold text-emerald tracking-wider uppercase">Seguridad de banco</span>
              </div>
              <h2
                id="seguridad-heading"
                className="text-2xl font-semibold tracking-[-0.02em] mb-4 leading-snug"
                style={{ textWrap: 'balance' } as React.CSSProperties}
              >
                Tus archivos del SAT, siempre bajo llave.
              </h2>
              <p
                className="text-muted text-sm leading-relaxed max-w-[50ch]"
                style={{ textWrap: 'pretty' } as React.CSSProperties}
              >
                Tu .cer y .key se encriptan punto a punto con AES-256 antes de salir de tu dispositivo.
                La contraseña de tu clave privada jamás se almacena en texto plano.
              </p>
            </motion.div>

            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.65, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-3"
            >
              {[
                { label: 'Cifrado AES-256', detail: 'Archivos .cer y .key encriptados en origen' },
                { label: 'Zero Knowledge', detail: 'La contraseña FIEL nunca llega a nuestros servidores' },
                { label: 'TLS 1.3', detail: 'Toda comunicación en tránsito protegida' },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-start gap-3 bg-bg border border-border rounded-xl p-4"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald mt-1.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.label}</p>
                    <p className="text-xs text-muted mt-0.5">{item.detail}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="max-w-6xl mx-auto px-6 py-28 text-center relative">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Ambient glow behind CTA */}
            <div
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto rounded-full pointer-events-none"
              style={{
                width: 400, height: 200,
                background: 'radial-gradient(ellipse, oklch(0.72 0.17 162 / 0.08) 0%, transparent 70%)',
                filter: 'blur(40px)',
              }}
              aria-hidden="true"
            />
            <h2
              className="text-3xl font-semibold tracking-[-0.02em] mb-4 relative"
              style={{ textWrap: 'balance' } as React.CSSProperties}
            >
              Empieza a hablar con el SAT hoy.
            </h2>
            <p className="text-muted text-sm mb-8 relative">
              Sin instalaciones. Sin contadores. Solo tu voz.
            </p>
            <motion.button
              type="button"
              onClick={() => onNavigate('auth')}
              className="btn-shine relative h-11 px-8 rounded-full bg-emerald text-bg font-semibold text-sm inline-flex items-center gap-2"
              whileHover={{ scale: 1.04, boxShadow: '0 0 32px oklch(0.72 0.17 162 / 0.50)' }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              Conectar con el SAT
              <ArrowRight size={15} aria-hidden="true" />
            </motion.button>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto" role="contentinfo" style={{ position: 'relative', zIndex: 1 }}>
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-emerald flex items-center justify-center text-bg font-bold" aria-hidden="true">S</span>
            <span>SATI · Asistente Financiero Inteligente</span>
          </div>
          <p>© {new Date().getFullYear()} SATI. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
