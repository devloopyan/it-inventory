import ClearanceFormClient from "./clearance-form-client";

export default async function ClearanceFormPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  return <ClearanceFormClient formId={formId} />;
}
