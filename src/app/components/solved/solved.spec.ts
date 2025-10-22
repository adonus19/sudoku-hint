import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Solved } from './solved';

describe('Solved', () => {
  let component: Solved;
  let fixture: ComponentFixture<Solved>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Solved]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Solved);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
