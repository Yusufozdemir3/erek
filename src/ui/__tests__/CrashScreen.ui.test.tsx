// Çökme ekranı: sağlayıcısız çalışır, hatayı bir kez bildirir, "Yeniden dene" çalışır.

import { render, fireEvent } from '@testing-library/react-native';
import { CrashScreen, crashText } from '@/ui/CrashScreen';

describe('CrashScreen', () => {
  it('tr metni gösterir (test cihazı tr) ve sağlayıcı gerektirmez', () => {
    const u = render(<CrashScreen error={new Error('x')} retry={jest.fn()} />);
    expect(u.getByText('Bir şeyler ters gitti')).toBeTruthy();
    expect(u.getByText(/Verilerin güvende/)).toBeTruthy();
  });

  it('hatayı bir kez bildirir; yeniden çizimde tekrar bildirmez', () => {
    const report = jest.fn();
    const error = new Error('boom');
    const u = render(<CrashScreen error={error} retry={jest.fn()} report={report} />);
    u.rerender(<CrashScreen error={error} retry={jest.fn()} report={report} />);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(error);
    u.rerender(<CrashScreen error={new Error('other')} retry={jest.fn()} report={report} />);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('bildirim hata verirse ekran yine görünür', () => {
    const report = jest.fn(() => {
      throw new Error('sentry down');
    });
    const u = render(<CrashScreen error={new Error('x')} retry={jest.fn()} report={report} />);
    expect(u.getByText('Bir şeyler ters gitti')).toBeTruthy();
  });

  it('"Yeniden dene" retry çağırır', () => {
    const retry = jest.fn();
    const u = render(<CrashScreen error={new Error('x')} retry={retry} />);
    fireEvent.press(u.getByLabelText('Yeniden dene'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('dil seçimi: tr/de kendi dilinde, diğer her şey İngilizce', () => {
    expect(crashText('tr').retry).toBe('Yeniden dene');
    expect(crashText('de').retry).toBe('Erneut versuchen');
    expect(crashText('en').retry).toBe('Try again');
    expect(crashText('fr').retry).toBe('Try again');
    expect(crashText(null).retry).toBe('Try again');
  });
});
