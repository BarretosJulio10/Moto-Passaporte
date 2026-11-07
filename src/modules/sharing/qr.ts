import QRCode from 'qrcode'

export const QR_OPTIONS = {
  errorCorrectionLevel: 'M' as const,
  margin: 1,
  color: { dark: '#1C2B4A', light: '#F8FAF5' },
}

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: 'svg' })
}

export async function downloadQrPng(url: string, fileLabel: string) {
  const dataUrl = await QRCode.toDataURL(url, { ...QR_OPTIONS, width: 1024 })
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `moto-passaporte-${fileLabel.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}-qrcode.png`
  link.click()
}
