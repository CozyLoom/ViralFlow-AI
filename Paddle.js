Paddle.Environment.set("sandbox"); // remove this line for live
Paddle.Initialize({ token: "test_YOUR_CLIENT_TOKEN" });
function subscribe(user) {
  Paddle.Checkout.open({
    items: [{ priceId: "pri_YOUR_PRICE_ID", quantity: 1 }],
    customer: { email: user.email },
    customData: { userId: user.id }   // lets you match payment to user later
  });
}
