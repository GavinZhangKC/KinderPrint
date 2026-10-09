import './InfiniteImageGallery.css'

const galleryItems = [
  { src: '/Images/01_higher-risk_sick-child_5858715.jpg', alt: 'A child receiving care while unwell', width: 220, height: 292 },
  { src: '/Images/02_typical_newborn-care_19773994.jpg', alt: 'A caregiver looking after a newborn baby', width: 330, height: 220 },
  { src: '/Images/03_typical_child-health-check_7653121.jpg', alt: 'A doctor checking a child during a health appointment', width: 220, height: 330 },
  { src: '/Images/04_higher-risk_less-supportive-street_17354198.jpg', alt: 'A child in a less supportive street environment', width: 218, height: 304 },
  { src: '/Images/05_typical_family-health-consultation_7653333.jpg', alt: 'A mother and child consulting a doctor', width: 330, height: 220 },
  { src: '/Images/06_typical_paediatric-checkup_8460049.jpg', alt: 'A child attending a paediatric checkup with her mother', width: 330, height: 220 },
  { src: '/Images/07_typical_school-lunch_5905614.jpg', alt: 'Children sharing lunch at school', width: 366, height: 226 },
  { src: '/Images/08_typical_health-check_8460047.jpg', alt: 'A child attending a routine health check', width: 310, height: 198 },
  { src: '/Images/09_supportive_running-green-space_7105875.jpg', alt: 'A child running through green space', width: 218, height: 304 },
  { src: '/Images/10_supportive_playing-green-park_4453147.jpg', alt: 'Children playing together in a green park', width: 360, height: 222 },
  { src: '/Images/11_supportive_cycling-green-park_38899615.jpg', alt: 'Children cycling through a green park', width: 336, height: 210 },
  { src: '/Images/12_supportive_family-cycling_7982166.jpg', alt: 'A family cycling together outdoors', width: 224, height: 300 },
  { src: '/Images/13_typical_child-pulse-check_5998450.jpg', alt: 'A doctor checking a child\'s pulse', width: 330, height: 220 },
] as const

export default function InfiniteImageGallery() {
  const renderItems = (isDuplicate = false) => (
    <div className="infinite-image-gallery__group" aria-hidden={isDuplicate || undefined}>
      {galleryItems.map((item) => (
        <img
          key={item.src}
          src={item.src}
          alt={isDuplicate ? '' : item.alt}
          width={item.width}
          height={item.height}
          loading="lazy"
        />
      ))}
    </div>
  )

  return (
    <section className="infinite-image-gallery" aria-label="Child health and neighbourhood environments">
      <div className="infinite-image-gallery__track">
        {renderItems()}
        {renderItems(true)}
      </div>
    </section>
  )
}
