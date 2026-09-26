/**
 * Next.js App Router — developer demo page stub.
 *
 * Live interactive runner in this monorepo (Angular):
 *   /smartcrop/demo  (also redirected from /demo)
 *
 * Features: tier switcher, simulate quota, reset counter,
 * MediaPipe crop + Clipdrop Generative Fill before/after.
 */
export default function DemoPage() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 640 }}>
      <h1>CropFlow · Developer Demo</h1>
      <p>
        This monorepo serves the interactive demo from the Angular app at{' '}
        <code>/smartcrop/demo</code> (redirect: <code>/demo</code>).
      </p>
      <p>
        API targets: <code>POST /api/photos/process</code>,{' '}
        <code>POST /api/photos/generative-fill</code> (Express).
      </p>
    </main>
  );
}
