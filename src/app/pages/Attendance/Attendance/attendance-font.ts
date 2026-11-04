/* Loads the reference typeface (Public Sans) once for the attendance pages.
   Imported for its side effect by the attendance services and the original pages:
     import '../Attendance/attendance-font';
   If your app already loads Public Sans in index.html or styles.css, this does nothing extra. */
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&display=swap';

try {
  if (typeof document !== 'undefined' && !document.getElementById('ak-public-sans')) {
    const link = document.createElement('link');
    link.id = 'ak-public-sans';
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    document.head.appendChild(link);
  }
} catch { /* no DOM (server rendering) */ }

export {};
