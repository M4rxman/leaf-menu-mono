export interface LandingCopy {
  htmlLang: string
  title: string
  description: string
  heroTitle: string
  heroText: string
  seeDemo: string
  getMenu: string
  howTitle: string
  steps: { title: string, text: string }[]
  featuresTitle: string
  features: string[]
  notTitle: string
  notText: string
  demoTitle: string
  demoText: string
  contactTitle: string
  contactText: string
  otherLang: { label: string, to: string }
}

export const landing: Record<'en' | 'pt', LandingCopy> = {
  en: {
    htmlLang: 'en',
    title: 'Digital QR menus for restaurants',
    description: 'One QR code, one menu page per venue. Dishes, prices, photos, allergens, six languages and guest likes. No app, no ordering fees.',
    heroTitle: 'Your menu, one QR code away',
    heroText: 'Chilly Menu gives every restaurant and bar a fast, multilingual menu page that guests open by scanning a QR code. You edit it any time; the printed code never changes.',
    seeDemo: 'See a live menu',
    getMenu: 'Get your menu',
    howTitle: 'How it works',
    steps: [
      { title: 'We set up your venue', text: 'We create your menu page and your owner account.' },
      { title: 'You add your dishes', text: 'Categories, prices, photos, allergens and translations, from any browser.' },
      { title: 'Print the QR, guests scan', text: 'Download the QR as SVG, PNG or a ready A6 card and put it on the table.' }
    ],
    featuresTitle: 'What you get',
    features: [
      'A menu page for your venue, fast on any phone, no app to install',
      'Categories, photos, prices and allergens',
      'Six languages: English, Portuguese, Spanish, German, Ukrainian, French. You choose which to offer',
      'Guest likes on every dish, shown to everyone',
      'Hide a dish or mark it sold out in one tap',
      'QR code download: SVG, print-quality PNG, A6 card PDF',
      'Hosting, updates and backups included'
    ],
    notTitle: 'What it is not',
    notText: 'No online ordering, no payments and no commission. It is a menu, and a good one.',
    demoTitle: 'See it in action',
    demoText: 'Casa Strega, an Italian wine bar in Porto, uses Chilly Menu. Open its menu the way a guest would.',
    contactTitle: 'Want one for your venue?',
    contactText: 'Write to us and we will set it up.',
    otherLang: { label: 'Português', to: '/pt' }
  },
  pt: {
    htmlLang: 'pt',
    title: 'Menus digitais com QR para restaurantes',
    description: 'Um código QR, uma página de menu por espaço. Pratos, preços, fotos, alergénios, seis idiomas e gostos dos clientes. Sem app, sem taxas de pedidos.',
    heroTitle: 'O seu menu, a um QR de distância',
    heroText: 'O Chilly Menu dá a cada restaurante e bar uma página de menu rápida e multilingue, que os clientes abrem ao ler um código QR. Edita quando quiser; o código impresso nunca muda.',
    seeDemo: 'Ver um menu real',
    getMenu: 'Quero o meu menu',
    howTitle: 'Como funciona',
    steps: [
      { title: 'Configuramos o seu espaço', text: 'Criamos a sua página de menu e a sua conta de proprietário.' },
      { title: 'Adiciona os seus pratos', text: 'Categorias, preços, fotos, alergénios e traduções, a partir de qualquer browser.' },
      { title: 'Imprime o QR, os clientes leem', text: 'Descarregue o QR em SVG, PNG ou um cartão A6 pronto e coloque-o na mesa.' }
    ],
    featuresTitle: 'O que recebe',
    features: [
      'Uma página de menu para o seu espaço, rápida em qualquer telemóvel, sem instalar nada',
      'Categorias, fotos, preços e alergénios',
      'Seis idiomas: inglês, português, espanhol, alemão, ucraniano, francês. Escolhe quais oferecer',
      'Gostos dos clientes em cada prato, visíveis para todos',
      'Esconda um prato ou marque-o como esgotado com um toque',
      'Download do código QR: SVG, PNG em qualidade de impressão, cartão A6 em PDF',
      'Alojamento, atualizações e cópias de segurança incluídos'
    ],
    notTitle: 'O que não é',
    notText: 'Sem pedidos online, sem pagamentos e sem comissões. É um menu, e dos bons.',
    demoTitle: 'Veja em ação',
    demoText: 'A Casa Strega, um wine bar italiano no Porto, usa o Chilly Menu. Abra o menu como um cliente.',
    contactTitle: 'Quer um para o seu espaço?',
    contactText: 'Escreva-nos e tratamos da configuração.',
    otherLang: { label: 'English', to: '/' }
  }
}
