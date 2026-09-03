/** The President's confidentiality note, shown beside the form. The wording is
 *  the owner's own and must not be edited, shortened or paraphrased. */
export function FeedbackPromise() {
  return (
    <aside className="fb-promise">
      <div className="eyebrow">A note from the President</div>
      <p className="body-text">
        All your feedback has been collected and analyzed with utmost care.
      </p>
      <p className="body-text">
        Your grievances and suggestions will be taken seriously and, wherever
        possible, will be implemented or worked upon for improvement.
      </p>
      <p className="body-text">
        I guarantee that your identity and responses will remain strictly
        confidential.
      </p>
      <p className="fb-sign">
        &mdash; Charan Cheedella
        <span>President, CSE Clubs Council</span>
      </p>
    </aside>
  );
}
