Place your dataset file here as:

- `transactions.csv`

Expected useful columns (you can rename in the notebook template if needed):

- `transaction_id`
- `customer_id`
- `date` (or `transaction_ts`)
- `day_of_week`
- `time_slot`
- `total_amount`
- `payment_method`
- `items_json` (JSON string list of items)

Example `items_json` value:

```json
[{"itemName":"Tea","quantity":1,"price":15},{"itemName":"Samosa","quantity":2,"price":15}]
```
