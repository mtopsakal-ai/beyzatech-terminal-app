# Beyzatech Terminal v24.1

## v24.1 — Özkaynak ve stop tabanlı canlı risk yönetimi

- Demo ve gerçek hesap API anahtarları birbirinden ayrıldı.
- Emir teminatı hesap özkaynağı, stop mesafesi ve risk yüzdesine göre dinamik hesaplanır.
- Günlük kayıp yüzdesi, tepe özkaynak düşüşü ve asgari özkaynak kilitleri eklendi.
- Gerçek hesap otomasyonu varsayılan olarak kapalı ve çoklu onay kilitlidir.

## v24.0 — Güvenlik kilitli Bitget gerçek hesap desteği

- Demo ve gerçek hesap modu birbirinden açık biçimde ayrıldı.
- Gerçek hesap varsayılan olarak kapalıdır ve dört ayrı sunucu onayı olmadan açılamaz.
- Manuel gerçek emir öncesinde uygulama içinde ikinci onay gerekir.
- Otomatik gerçek işlem ayrı bir izinle açılır; sunucu yeniden başlayınca otomatik pilot kapalı gelir.
- Canlı hesapta emir tutarı, kaldıraç, günlük zarar ve günlük emir sayısı için daha dar limitler uygulanır.
- API anahtarları yalnızca Railway sunucusunda tutulur; APK içine eklenmez.
- Acil durdurma yeni emirleri engeller ancak açık pozisyonları kapatmaz.
- Emir yalnızca Bitget'te dolum, açık pozisyon ve stop/TP koruması ayrı ayrı doğrulandıktan sonra başarılı sayılır.
- Otomasyon durumu kalıcı diskte tutulur; yeniden başlatmada açık pozisyonlar borsa ile uzlaştırılır.
- Tanınmayan veya korumasız pozisyon görülürse yeni emirler otomatik olarak kilitlenir.
- Zaman dilimleri artık eşitlik aramaz; ana zaman, üst zaman ve kısa vadeli geri çekilmeyi ağırlıklı piyasa rejimiyle değerlendirir.

Kurulum ve canlı moda geçiş ayrıntıları için `server/README.md` dosyasına bakın. Önce Demo modunda doğrulama yapılması ve canlı başlangıçta 1–5 USDT ile 1x kaldıraç kullanılması önerilir.
