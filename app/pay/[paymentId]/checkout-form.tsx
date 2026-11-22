import { Button } from "@/components/ui/button";

// Posts the signed fields to PayFast's hosted payment page. A plain form, so
// it works without JavaScript.
export function CheckoutForm({ action, fields, label }: { action: string; fields: [string, string][]; label: string }) {
  return (
    <form action={action} method="post" className="mt-6">
      {fields.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" size="lg" className="w-full">
        {label}
      </Button>
    </form>
  );
}
