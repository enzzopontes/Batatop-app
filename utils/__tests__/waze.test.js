import {
  buildWazeNavigationUrl,
  formatAddressForWaze,
  isPickupDeliveryType,
  isSafeWazeUrl,
} from '../waze';

describe('utils/waze', () => {
  test('prioriza coordenadas válidas sobre endereço', () => {
    const url = buildWazeNavigationUrl({
      deliveryType: 'delivery',
      address: 'Rua das Flores, 120',
      neighborhood: 'Centro',
      deliveryLat: -21.8928,
      deliveryLng: -49.0226,
    });
    expect(url).toBe('https://waze.com/ul?ll=-21.8928,-49.0226&navigate=yes');
  });

  test('aceita coordenadas válidas em metadata quando campos diretos estão ausentes', () => {
    const url = buildWazeNavigationUrl({
      deliveryType: 'delivery',
      address: 'Rua das Flores, 120',
      metadata: { delivery_lat: '-21.8402', delivery_lng: '-49.0058' },
    });
    expect(url).toBe('https://waze.com/ul?ll=-21.8402,-49.0058&navigate=yes');
  });

  test('usa fallback de metadata quando coordenadas diretas são "" ou NaN', () => {
    const urlEmptyDirect = buildWazeNavigationUrl({
      deliveryType: 'delivery',
      address: 'Rua das Flores, 120',
      deliveryLat: '',
      deliveryLng: '',
      metadata: { delivery_lat: '-21.8402', delivery_lng: '-49.0058' },
    });
    expect(urlEmptyDirect).toBe('https://waze.com/ul?ll=-21.8402,-49.0058&navigate=yes');

    const urlNanDirect = buildWazeNavigationUrl({
      deliveryType: 'delivery',
      address: 'Rua das Flores, 120',
      deliveryLat: Number.NaN,
      deliveryLng: Number.NaN,
      metadata: { delivery_lat: -21.8928, delivery_lng: -49.0226 },
    });
    expect(urlNanDirect).toBe('https://waze.com/ul?ll=-21.8928,-49.0226&navigate=yes');
  });

  test('ignora coordenadas inválidas (0,0, NaN, fora do intervalo) e usa fallback de endereço', () => {
    const invalidCoords = [
      { deliveryLat: 0, deliveryLng: 0 },
      { deliveryLat: Number.NaN, deliveryLng: -49.02 },
      { deliveryLat: -21.89, deliveryLng: Number.POSITIVE_INFINITY },
      { deliveryLat: 91, deliveryLng: -49.02 },
      { deliveryLat: -21.89, deliveryLng: 185 },
      { deliveryLat: '', deliveryLng: '' },
    ];

    for (const coords of invalidCoords) {
      const url = buildWazeNavigationUrl({
        deliveryType: 'delivery',
        address: 'Rua das Flores, 120',
        neighborhood: 'Centro',
        ...coords,
      });
      expect(url).toMatch(/^https:\/\/waze\.com\/ul\?q=/);
      expect(url).toMatch(/&navigate=yes$/);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('q')).toBe('Rua das Flores, 120, Centro, Iacanga - SP');
    }
  });

  test('combina bairro apenas se ainda não contido no endereço (sem acentos / case-insensitive)', () => {
    expect(
      formatAddressForWaze({
        address: 'Rua das Flores, 120',
        neighborhood: 'Jardim São José',
      })
    ).toBe('Rua das Flores, 120, Jardim São José, Iacanga - SP');

    expect(
      formatAddressForWaze({
        address: 'Rua das Flores, 120 - jardim sao jose, Iacanga/SP',
        neighborhood: 'Jardim São José',
      })
    ).toBe('Rua das Flores, 120, jardim sao jose, Iacanga/SP');
  });

  test('limpa complementos e observações sem corromper rua, número, bairro, CEP ou cidade/UF', () => {
    expect(
      formatAddressForWaze({
        address:
          'Rua das Flores, 120 - Apto 302 - Bloco B (Portão azul, interfone 12) - Centro, 17187-074, Iacanga/SP',
        neighborhood: 'Centro',
        complement: 'Apto 302',
      })
    ).toBe('Rua das Flores, 120, Centro, 17187-074, Iacanga/SP');

    expect(
      formatAddressForWaze({
        address: 'Rua Casa Branca, 45 Casa 2 - Fundos - Portão preto',
        neighborhood: 'Vila Nova',
        complement: 'Casa 2',
      })
    ).toBe('Rua Casa Branca, 45, Vila Nova, Iacanga - SP');

    expect(
      formatAddressForWaze(
        { address: 'Rua das Flores, 120', neighborhood: 'Centro' },
        { defaultCity: null, defaultState: null }
      )
    ).toBe('Rua das Flores, 120, Centro');
  });

  test('retorna null para pedidos de retirada (pickup / retirada)', () => {
    expect(isPickupDeliveryType('pickup')).toBe(true);
    expect(isPickupDeliveryType('retirada')).toBe(true);
    expect(
      buildWazeNavigationUrl({
        deliveryType: 'pickup',
        address: 'Rua das Flores, 120',
        deliveryLat: -21.8928,
        deliveryLng: -49.0226,
      })
    ).toBeNull();
    expect(
      buildWazeNavigationUrl({
        deliveryType: 'retirada',
        address: 'Rua das Flores, 120',
        deliveryLat: -21.8928,
        deliveryLng: -49.0226,
      })
    ).toBeNull();
  });

  test('retorna null para endereços vazios ou genéricos', () => {
    const emptyCases = [
      '',
      '   ',
      'Endereço não informado',
      'Retirada no Balcão',
      'Apto 12 (fundos)',
      ',,,',
    ];
    for (const address of emptyCases) {
      expect(
        buildWazeNavigationUrl({
          deliveryType: 'delivery',
          address,
        })
      ).toBeNull();
    }
  });

  test('neutraliza caracteres especiais e tentativas de injeção na URL', () => {
    expect(
      buildWazeNavigationUrl({
        deliveryType: 'delivery',
        address: 'javascript:alert(1)',
      })
    ).toBeNull();

    const url = buildWazeNavigationUrl({
      deliveryType: 'delivery',
      address: 'Rua São João & Filhos, 88#redirect=https://evil.com?x=1\r\n',
      neighborhood: 'Centro',
    });

    expect(url).not.toBeNull();
    expect(isSafeWazeUrl(url)).toBe(true);
    expect(url.startsWith('https://waze.com/ul?')).toBe(true);
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://waze.com');
    expect(parsed.pathname).toBe('/ul');
    expect(parsed.searchParams.get('navigate')).toBe('yes');
    expect(parsed.searchParams.get('redirect')).toBeNull();
  });

  test('mescla opções parciais por chave e permite defaultCity sem defaultState', () => {
    expect(
      formatAddressForWaze(
        { address: 'Rua das Flores, 120', neighborhood: 'Centro' },
        { defaultCity: 'Bauru' }
      )
    ).toBe('Rua das Flores, 120, Centro, Bauru - SP');

    expect(
      formatAddressForWaze(
        { address: 'Rua das Flores, 120', neighborhood: 'Centro' },
        { defaultState: 'MG' }
      )
    ).toBe('Rua das Flores, 120, Centro, Iacanga - MG');

    expect(
      formatAddressForWaze(
        { address: 'Rua das Flores, 120', neighborhood: 'Centro' },
        { defaultState: null }
      )
    ).toBe('Rua das Flores, 120, Centro, Iacanga');

    expect(
      formatAddressForWaze(
        { address: 'Rua das Flores, 120', neighborhood: 'Centro' },
        { defaultCity: 'Bauru', defaultState: '' }
      )
    ).toBe('Rua das Flores, 120, Centro, Bauru');

    const urlPartial = buildWazeNavigationUrl(
      { deliveryType: 'delivery', address: 'Rua das Flores, 120' },
      { defaultCity: 'Bauru' }
    );
    expect(new URL(urlPartial).searchParams.get('q')).toBe('Rua das Flores, 120, Bauru - SP');
  });

  test('isSafeWazeUrl rejeita #hash, parâmetros extras e payloads inválidos', () => {
    expect(isSafeWazeUrl('https://waze.com/ul?ll=-21.8928,-49.0226&navigate=yes')).toBe(true);
    expect(isSafeWazeUrl('https://waze.com/ul?q=Rua%20das%20Flores%2C%20120&navigate=yes')).toBe(
      true
    );

    expect(
      isSafeWazeUrl('https://waze.com/ul?q=Rua%20das%20Flores&navigate=yes#evil')
    ).toBe(false);
    expect(
      isSafeWazeUrl('https://waze.com/ul?ll=-21.8928,-49.0226&navigate=yes#hash')
    ).toBe(false);
    expect(
      isSafeWazeUrl(
        'https://waze.com/ul?q=Rua%20das%20Flores&navigate=yes&redirect=https://evil.com'
      )
    ).toBe(false);
    expect(
      isSafeWazeUrl('https://waze.com/ul?ll=-21.8928,-49.0226&q=Rua&navigate=yes')
    ).toBe(false);
    expect(isSafeWazeUrl('https://waze.com/ul?navigate=yes')).toBe(false);
    expect(isSafeWazeUrl('https://waze.com/ul?ll=0,0&navigate=yes')).toBe(false);
    expect(isSafeWazeUrl('https://waze.com/ul?q=%20%20&navigate=yes')).toBe(false);
    expect(isSafeWazeUrl('https://waze.com/ul?q=Rua&navigate=no')).toBe(false);
  });
});
