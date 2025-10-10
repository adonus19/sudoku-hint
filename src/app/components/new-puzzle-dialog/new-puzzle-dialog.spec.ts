import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewPuzzleDialog } from './new-puzzle-dialog';

describe('NewPuzzleDialog', () => {
  let component: NewPuzzleDialog;
  let fixture: ComponentFixture<NewPuzzleDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewPuzzleDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewPuzzleDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
