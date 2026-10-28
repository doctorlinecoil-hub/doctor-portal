'use client';
import Icon from '@/components/Icon';

export default function PrintButton() {
  return <button type="button" className="btn btn-primary" onClick={() => window.print()}><Icon name="printer" />הדפסה / שמירה כ־PDF</button>;
}
