import { ArrowRight, ChevronRight, Info, Check, ArrowLeft, LockKeyhole } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { titles, type Screen } from './navigation';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Notice({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return (
    <div className={`notice ${tone}`}>
      <Info size={17} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function Section({
  title,
  children,
  link,
  label = 'View all',
}: {
  title: string;
  children: ReactNode;
  link?: string;
  label?: string;
}) {
  return (
    <section className="section">
      <div className="section-heading">
        <h2>{title}</h2>
        {link && (
          <a href={`#${link}`}>
            {label}
            <ArrowRight size={15} />
          </a>
        )}
      </div>
      {children}
    </section>
  );
}
export function Row({
  title,
  subtitle,
  href,
  icon,
  trailing,
}: {
  title: string;
  subtitle?: string;
  href: string;
  icon?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <a className="row" href={`#${href}`}>
      {icon && <span className="row-icon">{icon}</span>}
      <span className="row-copy">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
      {trailing}
      <ChevronRight size={17} aria-hidden="true" />
    </a>
  );
}
export function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="facts">
      {items.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value || 'Not reported'}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Steps({ items }: { items: [string, string][] }) {
  return (
    <ol className="steps">
      {items.map(([title, body]) => (
        <li key={title}>
          <div>
            <strong>{title}</strong>
            <p>{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
export function CheckList({ items, neutral = false }: { items: string[]; neutral?: boolean }) {
  return (
    <ul className={`check-list${neutral ? ' neutral-list' : ''}`}>
      {items.map((item) => (
        <li key={item}>
          {neutral ? <LockKeyhole size={17} /> : <Check size={17} />}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
export function ButtonLink({
  children,
  href,
  secondary = false,
}: {
  children: ReactNode;
  href: string;
  secondary?: boolean;
}) {
  return (
    <a className={`button${secondary ? ' secondary' : ''}`} href={`#${href}`}>
      {children}
      <ArrowRight size={17} />
    </a>
  );
}
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PageHeader({
  screen,
  back,
  subtitle,
  title,
}: {
  screen: Screen;
  back?: string;
  subtitle?: string;
  title?: string;
}) {
  return (
    <header className="page-header">
      {back && (
        <a
          className="icon-button back"
          href={`#${back}`}
          aria-label={`Back to ${titles[back.split('/')[0] as Screen] ?? 'previous page'}`}
        >
          <ArrowLeft size={21} />
        </a>
      )}
      <div>
        <h1 id="page-title" tabIndex={-1}>
          {title ?? titles[screen]}
        </h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      before?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal">
        <h2 id="dialog-title">{title}</h2>
        {children}
        <button className="button secondary" onClick={close}>
          Close
        </button>
      </div>
    </dialog>
  );
}
