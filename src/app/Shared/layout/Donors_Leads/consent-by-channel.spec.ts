import { consentByChannel } from './fu-store';

/**
 * TS-248: a channel is "ok" only when the server lists it as permitted. The server answers
 * `hasWarning: false` for a lead who agreed to phone calls only, and that used to read as
 * consent on every channel.
 */
describe('consentByChannel (TS-248, NEW-02)', () => {
  it('marks only the granted channel ok for a lead who agreed to phone calls only', () => {
    const map = consentByChannel({
      hasWarning: false, level: 'None', message: 'Every recorded channel permits contact.',
      permittedChannels: ['PhoneCall'], prohibitedChannels: [],
    });
    expect(map).toEqual({ call: 'ok', email: 'caution', sms: 'caution', whatsapp: 'caution', post: 'caution' });
  });

  it('asks for confirmation on every channel when nothing is recorded', () => {
    const map = consentByChannel({
      hasWarning: true, level: 'Caution', message: 'No consent has been recorded.',
      permittedChannels: [], prohibitedChannels: [],
    });
    expect(Object.values(map)).toEqual(['caution', 'caution', 'caution', 'caution', 'caution']);
  });

  it('blocks a withdrawn channel and keeps the granted one ok', () => {
    const map = consentByChannel({
      hasWarning: true, level: 'Caution', message: 'Contact is not permitted by WhatsApp.',
      permittedChannels: ['Email'], prohibitedChannels: ['WhatsApp'],
    });
    expect(map.email).toBe('ok');
    expect(map.whatsapp).toBe('blocked');
    expect(map.call).toBe('caution');
  });

  it('blocks every channel for a do-not-contact record', () => {
    const map = consentByChannel({
      hasWarning: true, level: 'Blocking', message: 'Do not contact.',
      permittedChannels: [], prohibitedChannels: ['Email', 'Sms', 'WhatsApp', 'PhoneCall', 'Post'],
    });
    expect(Object.values(map).every((state) => state === 'blocked')).toBe(true);
  });

  it('fails closed when there is no answer at all (NEW-02)', () => {
    expect(Object.values(consentByChannel(null)).every((state) => state === 'caution')).toBe(true);
    expect(Object.values(consentByChannel(undefined)).every((state) => state === 'caution')).toBe(true);
  });
});
