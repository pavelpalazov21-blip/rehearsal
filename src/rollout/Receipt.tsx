import { ReceiptText } from 'lucide-react'
export function Receipt({ enabled }: { enabled: boolean }) {
  return (
    <div
      className="receipt"
      aria-label={
        enabled ? 'Itemized checkout receipt' : 'Total-only checkout receipt'
      }
    >
      <div className="receipt-head">
        <ReceiptText size={18} />
        <span>Market receipt</span>
      </div>
      {enabled && (
        <dl>
          {[
            ['Produce', '640'],
            ['Pantry', '420'],
            ['Household', '220'],
          ].map(([name, price]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{price} MKD</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="receipt-total">
        <strong>Basket total</strong>
        <strong>
          1,280 <small>MKD</small>
        </strong>
      </div>
    </div>
  )
}
