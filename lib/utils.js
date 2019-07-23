/**
 * Date string normalization
 *
 * Example:
 *
 *   YYYY/MM/DD
 *   YYYY-MM-DD
 *   MM-DD-YYYY
 *   YYYY-MM-DD HH:mm
 *   YYYY-MM-DD HH:mm:ss
 *   YYYY-MM-DD HH:mm:ss TMZ
 *
 * String search regex: yyyy-mm-dd(hh:mm(ss)(tmz|offset))
 *
 *   [0-9]{2,4}[\/-]
 *   [0-9]{2}[\/-]
 *   [0-9]{2,4}
 *   (
 *     \s?
 *     [0-9]{2}
 *     :[0-9]{2}
 *     (
 *       :[0-9]{2}
 *     )?
 *     (
 *       \s?
 *       (\+?)
 *       [a-zA-Z0-9]{3,4}
 *     )?
 *   )?

 * @param {String} date string
 * @return {String} normalized date string
 * @api private
 */

exports.dateFormat = date => {
  const dateRx = /[0-9]{2,4}[\/-][0-9]{2}[\/-][0-9]{2,4}/u; // 2012-02-03 || 02/03/2012
  const timeRx = /(\s?[0-9]{2}:[0-9]{2}(:[0-9]{2})?)?/u; // 03:55 || 03:55:01
  const tmzRx = /(\s?(\+?)[a-zA-Z0-9]{3,4})?/u; // GMT || +0200
  const rx = new RegExp(dateRx.source + timeRx.source + tmzRx.source, 'u');
  const defaults = [null, ' 00:00', ':00', ' +0000'];
  const match = date.match(rx);

  if (!match || date === (new Date(date)).toISOString()) {
    return '';
  }
  for (let i = 1; i < 4; ++i) {
    if (!match[i] && defaults[i]) {
      match[i] = defaults[i];
      match[0] += defaults[i];
    }
  }
  return match[0];
};
