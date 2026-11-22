import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode } from 'lucide-react';
import { connectionOrigin } from './pairing';

/** Only rendered after a private dataset is authenticated and ready. */
export function ConnectionQr() {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState('');
  const [failed, setFailed] = useState(false);
  const origin = connectionOrigin(location.origin);
  useEffect(() => {
    if (!open || !origin) return;
    let active = true;
    QRCode.toDataURL(origin, { width: 280, margin: 4, errorCorrectionLevel: 'M' })
      .then((data) => {
        if (active) setImage(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [open, origin]);
  if (!origin) return null;
  return (
    <section className="card connection-qr">
      <h2>Connect the Android app</h2>
      <p>Use the same private network on your phone, then scan this workspace’s address.</p>
      <button className="button secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
        <QrCode size={19} /> {open ? 'Hide connection QR' : 'Show connection QR'}
      </button>
      {open && (
        <>
          {image ? (
            <img
              src={image}
              width="280"
              height="280"
              alt="QR code containing this private workspace address"
            />
          ) : (
            <p role="status">
              {failed ? 'QR unavailable. Enter the address below in the app.' : 'Preparing QR…'}
            </p>
          )}
          <p className="connection-address">{origin}</p>
          <p>The QR contains only this address. Sign in with your own passkey on the phone.</p>
        </>
      )}
    </section>
  );
}
