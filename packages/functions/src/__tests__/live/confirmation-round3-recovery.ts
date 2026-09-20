/**
 * One additional clarification for each actionable boundary-confirmation turn.
 * Authored before provider trials from the original requests and saved history.
 * These restate scope only; catalog selection and expected assertions stay unchanged.
 */
export const boundaryRecoveryRequests: Readonly<Record<string, string>> = {
  "The grown-ups' breakfast is the one I meant; you can go ahead now.":
    "To clarify my earlier request, replace the adults' Monday breakfast with a different adult breakfast, and also replace the family dinner on Wednesday with a different family dinner. Keep the family's Monday breakfast and every other slot exactly as currently saved. Please make both requested changes now.",
  'Drop the breakfast change. Go ahead with everything else from that request.':
    "Cancel the Monday breakfast change and keep both Monday breakfasts as currently saved. The rest of my earlier request still stands: replace Tuesday's family lunch with a different lunch, and leave Wednesday's family dinner empty because we will not be home. Make those two edits and preserve every other slot.",
  "We won't need Monday supper or Tuesday lunch; please leave those two spaces empty.":
    "Please clear Monday's family dinner and Tuesday's family lunch so both slots are empty. Those are the only two meals we do not need. Keep both Monday breakfasts, Wednesday's family dinner, and every other slot exactly as saved.",
  "Wednesday's white bean skillet doesn't appeal to us. Pick another family dinner for that day and change the adults' Monday breakfast too.":
    "The earlier removals of Monday's family dinner and Tuesday's family lunch are already complete; keep those slots empty. For this new request, replace Wednesday's White bean skillet with a different family dinner and replace the adults' Monday breakfast with a different adult breakfast. Keep the family's Monday breakfast and every other saved slot unchanged. Please make only those two replacements.",
};
