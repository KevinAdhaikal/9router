export class NextResponse extends Response {
  static json(data, init = {}) {
    return Response.json(data, init);
  }
  static redirect(url, init = 302) {
    const status = typeof init === "number" ? init : (init?.status || 302);
    return Response.redirect(url, status);
  }
  static next() {
    return new Response(null, { headers: { "x-middleware-next": "1" } });
  }
}

export default NextResponse;
