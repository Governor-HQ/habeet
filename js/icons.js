/* habeet icons: small inline SVG paths (24x24 grid, stroke only). */
(function (root) {
  'use strict';
  var P = {
    run: '<circle cx="15" cy="4.5" r="2"/><path d="M12.5 9l-3 3.5 3 2 1 5.5M9.5 12.5l-4-1M12.5 9l3.5 1.2 2.5 3M13.5 14.5l3.5 1.5.8 3.5"/>',
    book: '<path d="M4 19V5.5A2 2 0 0 1 6 3.5h13v14H6.2A2.2 2.2 0 0 0 4 19.5V19zM6 20.5h13"/>',
    water: '<path d="M12 3s6 6.3 6 10.6a6 6 0 0 1-12 0C6 9.3 12 3 12 3z"/>',
    code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14"/>',
    lotus: '<path d="M12 4c3.2 3 4 6.5 0 10.5C8 10.5 8.8 7 12 4zM3.5 11.5C7 11.5 10 13 12 18M20.5 11.5C17 11.5 14 13 12 18"/>',
    pen: '<path d="M4 20l1-4.5L16 4.5 19.5 8 8.5 19zM14 6.5l3.5 3.5"/>',
    heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.2A4 4 0 0 1 19 10c0 5.500-7 10-7 10z"/>',
    dumbbell: '<path d="M6.5 7v10M3.5 10v4M17.5 7v10M20.5 10v4M6.5 12h11"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    sunrise: '<path d="M6.5 16a5.5 5.5 0 0 1 11 0M3 16h18M12 4v3M5 9l1.5 1.5M19 9l-1.5 1.5M8 20h8"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    star: '<path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8 5.4-.7z"/>',
    leaf: '<path d="M5 19c0-9 5-14 14-14 0 9-5 14-14 14zM5 19c3-4 6-6 9-8"/>',
    flame: '<path d="M12 3c.8 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 0 2 .8 3 2 3 .5-3-1-5 1-9z"/>',
    check: '<path d="M5.5 12.5l4.2 4.2L18.5 8"/>',
    today: '<rect x="4" y="5" width="16" height="15" rx="4"/><path d="M8 3v4M16 3v4M9 13l2.2 2.2L15.5 11"/>',
    bars: '<path d="M6 20v-7M12 20V5M18 20v-10"/>',
    list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.5" cy="7" r=".8"/><circle cx="4.5" cy="12" r=".8"/><circle cx="4.5" cy="17" r=".8"/>',
    gear: '<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M14.5 5l-7 7 7 7"/>',
    next: '<path d="M9.5 5l7 7-7 7"/>',
    down: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>',
    up: '<path d="M12 16V5M7.5 9L12 4.5 16.5 9M5 20h14"/>',
    skip: '<path d="M5 6l8 6-8 6zM17 6v12"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    archive: '<path d="M4 6h16v4H4zM6 10v9h12v-9M10 14h4"/>',
    edit: '<path d="M4 20l1-4.5L16 4.5 19.5 8 8.5 19zM14 6.5l3.5 3.5"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
    restore: '<path d="M4 12a8 8 0 1 0 2.500-5.800M4 4v4.500h4.500"/>'
  };
  var CHOICES = ['run', 'book', 'water', 'code', 'lotus', 'pen', 'heart', 'dumbbell', 'sun', 'moon', 'leaf', 'star'];
  function svg(name, size, width) {
    size = size || 20; width = width || 1.9;
    return '<svg class="i" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" stroke-width="' + width +
      '" aria-hidden="true" focusable="false">' + (P[name] || P.star) + '</svg>';
  }
  root.HabeetIcons = { svg: svg, CHOICES: CHOICES, has: function (n) { return !!P[n]; } };
})(self);
