// 11단계: 기기 승인 상태(읽기 전용). 승인 여부는 서버가 정하는 값이며, 화면의 버튼이나 설치 표시는 근거가 되지 않는다.
// 이 서버는 기기를 식별하거나 등록 여부를 저장하지 않고(등록은 반 엔진이 확인하고 판정기에 deviceRegistered로 전달하는 값이다),
// 엔진이 이 함수로 검증한 값을 넘겨 주는 계약도 아직 없다. 그래서 요청의 헤더·쿠키·쿼리·본문이 무엇이든 승인 전으로 답한다.
// 응답에는 기기 번호, 토큰, 사용자 정보가 들어 있지 않다.
export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  return response.status(200).json({ approved: false, reason: 'device_not_registered' });
}
