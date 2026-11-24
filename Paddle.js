Paddle.Initialize({ token: "live_503c49880fb49a1b9bd56cf32f9" });
function subscribe(user) {
  Paddle.Checkout.open({
    items: [{ priceId: "pri_01m7yjd6zvcnzve0r9xgvn8t9q", quantity: 1 }],
    customer: { email: user.email },
    customData: { userId: user.id }   // lets you match payment to user later
  });
}
