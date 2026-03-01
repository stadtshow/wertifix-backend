export const generateValuation = async (images: any[], adText: string) => {
  const res = await fetch('http://localhost:3001/api/valuation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, adText })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI Proxy Error: ${err}`);
  }
  return res.json();
};

export const analyzeSellerResponse = async (originalReport: string, sellerResponse: string) => {
  const res = await fetch('http://localhost:3001/api/seller-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ originalReport, sellerResponse })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI Proxy Error: ${err}`);
  }
  return res.json();
};
