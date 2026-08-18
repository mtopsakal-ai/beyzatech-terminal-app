# Beyzatech v24.1 İşlem Köprüsü

Bu servis Bitget Demo veya gerçek hesap emirlerini mobil uygulama adına sunucu tarafında yönetir. API anahtarları telefona ve APK dosyasına yazılmaz.

## Güvenli varsayılan

Yeni kurulum Demo modunda başlar. Gerçek hesap modu ancak aşağıdaki dört değişken birlikte ayarlanırsa açılır:

```env
EXECUTION_MODE=LIVE
DEMO_ONLY=false
LIVE_TRADING_ENABLED=true
LIVE_TRADING_CONFIRM=I_UNDERSTAND_REAL_MONEY
```

Otomatik gerçek emir için ayrıca `AUTO_TRADING_ENABLED=true` ve `LIVE_AUTO_TRADING_ENABLED=true` gerekir. Güvenli varsayılan olan `AUTO_RESUME_ON_RESTART=false` ile sunucu yeniden başladığında otomatik pilot kapalı başlar; açık pozisyonlar önce Bitget ile uzlaştırılır ve kontrol anahtarıyla yeniden başlatılması gerekir.

Demo ve canlı hesap aynı anahtarları paylaşmaz. Canlı hesap için ayrı değişkenler zorunludur:

```env
BITGET_LIVE_API_KEY=...
BITGET_LIVE_API_SECRET=...
BITGET_LIVE_API_PASSPHRASE=...
```

Önerilen ilk canlı limitler:

```env
LIVE_MAX_ORDER_USDT=5
LIVE_MAX_LEVERAGE=1
LIVE_MAX_DAILY_LOSS_USDT=5
LIVE_MAX_DAILY_ORDERS=2
LIVE_MAX_RISK_PER_TRADE_PCT=0.50
LIVE_MAX_MARGIN_PERCENT=5
LIVE_MAX_DAILY_LOSS_PCT=1
LIVE_MAX_DRAWDOWN_PCT=3
```

Emir büyüklüğü sabit USDT tutarıyla değil; Bitget hesap özkaynağı, stop mesafesi, ücret/kayma payı ve işlem başına risk yüzdesiyle hesaplanır. Teminat hem `LIVE_MAX_ORDER_USDT` hem de özkaynağın `LIVE_MAX_MARGIN_PERCENT` oranıyla sınırlandırılır. Günlük kayıp veya tepe özkaynak düşüşü limite ulaşırsa otomatik pilot kilitlenir.

Bitget API anahtarında yalnızca UTA/Futures `Orders` ve `Holdings` yetkilerini açın. Para çekme veya transfer yetkisi vermeyin; Railway sabit çıkış IP'si kullanıyorsanız anahtarı bu IP'ye bağlayın.

`ACİL DURDUR` yeni emirleri kilitler; borsadaki açık pozisyonları otomatik kapatmaz. Gerçek hesaba geçmeden önce Demo modunda uzun süre gözlemleyin.

## Kalıcı durum ve yeniden başlatma güvenliği

Railway servisine kalıcı bir Volume ekleyip `/data` yoluna bağlayın ve şu değişkeni kullanın:

```env
AUTO_STATE_FILE=/data/automation-state.json
AUTO_RESUME_ON_RESTART=false
AUTO_REQUIRE_EXCLUSIVE_ACCOUNT=true
AUTO_MAX_OPEN_POSITIONS=1
AUTO_RECONCILE_SECONDS=30
```

Servis her başlangıçta Bitget'teki açık pozisyonları yerel kayıtlarla karşılaştırır. Tanınmayan bir pozisyon veya doğrulanamayan stop/TP görülürse yeni emirler kilitlenir. Kilit ancak pozisyon/koruma sorunu giderildikten sonra `/v1/control/unlock` üzerinden `UNLOCK_AFTER_RECONCILE` onayıyla açılabilir.

## Emir yaşam döngüsü

Bir emir yalnızca şu üç aşama Bitget'ten doğrulandıktan sonra başarılı kabul edilir:

1. Ana emir borsa tarafından kabul edildi.
2. İlgili açık pozisyon gerçekten oluştu.
3. Stop-loss ve take-profit strateji emirleri açık emirlerde görüldü.

Herhangi bir aşama doğrulanmazsa emir `FAILED` veya `UNPROTECTED` durumuna geçer; korumasız pozisyon olasılığında acil kilit devreye girer.

## Canlıya geçiş kontrol listesi

- Önce Demo'da yeniden başlatma, bağlantı kesilmesi, kısmi dolum ve acil durdurma senaryolarını deneyin.
- Railway Volume'un yeniden dağıtımdan sonra durumu koruduğunu doğrulayın.
- Bitget hesabını bu bot için ayrı tutun veya `AUTO_REQUIRE_EXCLUSIVE_ACCOUNT=true` bırakın.
- API anahtarına çekim/transfer izni vermeyin; mümkünse sabit çıkış IP'siyle sınırlandırın.
- İlk canlı aşamada otomatik yeniden başlamayı kapalı, tek pozisyonu ve en düşük emir/kaldıraç limitlerini kullanın.
- Bu sistem kâr garantisi vermez; bağlantı, borsa, likidite ve model riski devam eder.
